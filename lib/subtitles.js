/* 字幕 → JIZURA 歌词
 *
 * JIZURA 原生支持在歌词行首写 LRC 时间戳：`[01:23.45]夜明けの色を`。
 * 所以 SRT / LRC / 纯文本都不需要改引擎——转成这个格式即可。
 *
 * 时间只用作「这一行的开始时刻」（LRC 语义）；行与行之间的空隙由引擎按 timing.tail 处理，
 * 所以 SRT 的结束时间不参与排版，这是刻意的。
 */

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** 秒 → [mm:ss.cc] */
export function stamp(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const ss = Math.floor(rest);
  const cc = Math.round((rest - ss) * 100);
  // 进位（0.999 → 1.00）
  if (cc === 100) return stamp(m * 60 + ss + 1);
  return `[${pad(m)}:${pad(ss)}.${pad(cc)}]`;
}

/** "00:01:23,450" / "01:23.450" / "83.45" → 秒 */
export function parseTime(raw) {
  const t = String(raw).trim().replace(',', '.');
  const parts = t.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

export function detectFormat(text, filename = '') {
  if (/^\uFEFF?WEBVTT/i.test(text)) return 'vtt';
  if (/-->/.test(text)) return 'srt';
  if (/\[\d{1,3}:\d{2}([.:]\d{1,3})?\]/.test(text)) return 'lrc';
  if (/\.(srt|vtt)$/i.test(filename)) return 'srt';
  if (/\.lrc$/i.test(filename)) return 'lrc';
  return 'text';
}

const HAS_CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

/** 多行字幕文本合成一行：中日韩直接相连（插空格会被引擎当成词界），拉丁文用空格 */
function joinCue(lines) {
  const text = lines.join('\n').trim();
  if (!text) return '';
  const pieces = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (pieces.length <= 1) return text;
  const joiner = HAS_CJK.test(text) ? '' : ' ';
  return pieces.join(joiner);
}

function cleanCue(text) {
  return String(text)
    .replace(/\{\\[^}]*\}/g, '')        // ASS 覆盖标签 {\an8}
    .replace(/<\/?[^>]+>/g, '')         // <i> <b> <c.foo>
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function parseCues(text) {
  const cues = [];
  // 统一换行，按空行切块
  const blocks = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (!lines.length) continue;
    const idx = lines.findIndex(l => l.includes('-->'));
    if (idx < 0) continue;                        // WEBVTT 头、NOTE 块等
    const [fromRaw] = lines[idx].split('-->');
    const start = parseTime(fromRaw);
    if (start === null) continue;
    const body = lines.slice(idx + 1).map(cleanCue).filter(Boolean);
    const text2 = joinCue(body);
    if (text2) cues.push({ start, text: text2 });
  }
  return cues.sort((a, b) => a.start - b.start);
}

const LRC_META = /^\[(ar|ti|al|by|offset|re|ve|length|tool|encoding):/i;

function parseLrc(text) {
  const out = [];
  for (const raw of String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || LRC_META.test(line)) continue;
    const tags = [];
    let rest = line;
    let m;
    const re = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/;
    while ((m = re.exec(rest))) {
      const frac = m[3] ? Number(('0.' + m[3])) : 0;
      tags.push(Number(m[1]) * 60 + Number(m[2]) + frac);
      rest = rest.slice(m[0].length);
    }
    const body = cleanCue(rest);
    if (!body) continue;
    if (!tags.length) { out.push({ start: null, text: body }); continue; }
    for (const t of tags) out.push({ start: t, text: body });
  }
  return out;
}

/**
 * 把字幕文本转成 JIZURA 的歌词。
 * @returns {{ format, lyrics, lines, timed, first, last }}
 */
export function subtitlesToLyrics(text, filename = '') {
  const format = detectFormat(text, filename);
  let items;

  if (format === 'srt' || format === 'vtt') {
    items = parseCues(text);
  } else if (format === 'lrc') {
    items = parseLrc(text);
  } else {
    items = String(text).split(/\n/).map(l => cleanCue(l)).filter(Boolean).map(t => ({ start: null, text: t }));
  }

  if (!items.length) throw new Error('字幕里没有解析出任何歌词行（SRT 需要 `-->` 时间行，LRC 需要 `[mm:ss.xx]`）');

  const timed = items.filter(i => i.start !== null);
  const lines = items.map(i => (i.start === null ? i.text : stamp(i.start) + i.text));
  return {
    format,
    lyrics: lines.join('\n'),
    lines: items.length,
    timed: timed.length,
    first: timed.length ? timed[0].start : null,
    last: timed.length ? timed[timed.length - 1].start : null,
  };
}
