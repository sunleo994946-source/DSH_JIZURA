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

const KANA = /[\u3040-\u30ff]/;
const HANGUL = /[\uac00-\ud7af]/;

/** 同一时刻有多行时，按目标语言挑一行（日文优先带假名的，中文优先不带假名的） */
function pickByLang(group, lang) {
  if (group.length === 1) return group[0];
  if (lang === 'ja') {
    const kana = group.filter(g => KANA.test(g.text));
    if (kana.length) return kana[0];
  } else if (lang === 'zh-Hans' || lang === 'zh-Hant') {
    const zh = group.filter(g => !KANA.test(g.text) && !HANGUL.test(g.text));
    if (zh.length) return zh[0];
  } else if (lang === 'ko') {
    const ko = group.filter(g => HANGUL.test(g.text));
    if (ko.length) return ko[0];
  }
  return group[0];
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

/* 音乐站导出的 LRC/SRT 常把版权信息也加上时间戳：作词 : 某某 / 編曲 : 某某 / Lyrics: xxx。
   这些不是歌词，进画面就是错的。只认「关键词 + 冒号」且后半段很短的形态，避免误杀正常歌词。 */
const CREDIT = /^(作词|作詞|作曲|编曲|編曲|制作人|製作人|制作|製作|演唱|原唱|演唱者|歌手|混音|母带|母帶|策划|企划|監製|监制|出品|词|詞|曲|Lyrics?|Music|Composer|Arranger|Producer|Vocals?|Mixing|Mastering|Written\s+by)\s*[:：]\s*(.{0,30})$/i;

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
    if (text2 && !CREDIT.test(text2)) cues.push({ start, text: text2 });
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
    if (!body || CREDIT.test(body)) continue;
    if (!tags.length) { out.push({ start: null, text: body }); continue; }
    for (const t of tags) out.push({ start: t, text: body });
  }
  return out;
}

/**
 * 把字幕文本转成 JIZURA 的歌词。
 * @param lang 'ja' | 'zh-Hans' | 'zh-Hant' | 'ko' | 'auto' —— 双语字幕时决定保留哪一条
 * @returns {{ format, lyrics, lines, timed, dropped, first, last }}
 */
export function subtitlesToLyrics(text, filename = '', lang = 'auto') {
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

  // 双语 LRC（原文 + 对照翻译）会给同一时刻挂两行。按目标语言挑一条，其余丢掉，
  // 否则画面会日文一行、译文一行交替出现。
  const groups = new Map();
  for (const it of items) {
    if (it.start === null) continue;
    const key = Math.round(it.start * 100);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  let kept = items.filter(i => i.start === null);
  let dropped = 0;
  for (const group of groups.values()) {
    kept.push(pickByLang(group, lang));
    dropped += group.length - 1;
  }
  kept.sort((a, b) => (a.start === null ? -1 : b.start === null ? 1 : a.start - b.start));
  items = kept;

  const timed = items.filter(i => i.start !== null);
  const lines = items.map(i => (i.start === null ? i.text : stamp(i.start) + i.text));
  return {
    format,
    lyrics: lines.join('\n'),
    lines: items.length,
    timed: timed.length,
    dropped,
    first: timed.length ? timed[0].start : null,
    last: timed.length ? timed[timed.length - 1].start : null,
  };
}
