#!/usr/bin/env node
/* dsh-jizura 命令行入口：不开 DSH，直接用引擎渲片。
 *
 * 例：
 *   node tools/render.mjs --subtitles song.lrc --lang ja --style magenta --audio song.mp3 --out out/
 *   node tools/render.mjs --project out/project.json --from 68 --to 80 --out seg/   （只渲一段）
 *   node tools/render.mjs --project out/project.json --layers --out layers/         （透明前后景）
 *
 * 全部参数见 --help。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JizuraRenderer, PARTS, VERSION } from '../lib/render.js';
import { subtitlesToLyrics } from '../lib/subtitles.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `
dsh-jizura 渲染器（引擎 JIZURA ${VERSION.jizura}）

输入（二选一）
  --project <file>        用已有 project.json（可复现，推荐）
  --subtitles <file>      字幕文件 .srt/.lrc/.vtt/.txt
  --lyrics <file|文本>    歌词文本（\\n 换行），或纯文本文件

编排
  --style <key>           样式包（jizura_parts 可查），默认 noir
  --theme <id>            lyricpv|kinetic|wa|horror|pop|ballad（会随机化风格）
  --seed <n>              同 seed 同画面
  --lang <code>           ja|zh-Hans|zh-Hant|ko|en|auto
  --aspect <w:h>          16:9|9:16|4:3|3:4|1:1|4:5|21:9
  --res <n>               画面高度 720/1080/1440/2160
  --fps <n>               24/30/60
  --extra --wa --horror --typo --kinetic --unify --typeset --center-free
  --key-bg <off|green|black>

输出
  --out <dir>             输出目录（必需）
  --audio <file>          混入音轨
  --from <s> --to <s>     只渲这一段
  --scale <n>             分辨率倍数，0.5 = 半尺寸快速预览
  --crf <n>               x264 质量，默认 22
  --layers                出透明前景/后景 PNG 序列（给 HyperFrames）
  --alpha prores          分层时额外编 ProRes 4444
  --sheet                 先出一张联络图
  --dry                   只出计划和联络图，不渲视频

例
  node tools/render.mjs --subtitles ~/song.lrc --lang ja --style magenta \\
       --audio ~/song.mp3 --out ~/out --sheet --crf 22
`;

function parseArgs(argv) {
  const a = { _: [] };
  const bools = new Set(['extra', 'wa', 'horror', 'typo', 'kinetic', 'unify', 'typeset', 'center-free', 'layers', 'sheet', 'dry', 'help']);
  const alias = { 'center-free': 'centerFree', 'key-bg': 'keyBg', alpha: 'alphaFormat' };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith('--')) { a._.push(raw); continue; }
    const key0 = raw.slice(2);
    const key = alias[key0] || key0.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (bools.has(key0)) { a[key] = true; continue; }
    const val = argv[++i];
    if (val === undefined) throw new Error(`--${key0} 需要一个值`);
    a[key] = val;
  }
  return a;
}

const argv = parseArgs(process.argv.slice(2));
if (argv.help || (!argv.project && !argv.subtitles && !argv.lyrics)) { console.log(HELP); process.exit(argv.help ? 0 : 1); }
if (!argv.out) { console.error('缺少 --out <目录>'); process.exit(1); }

const outDir = path.resolve(argv.out.replace(/^~/, process.env.HOME));
fs.mkdirSync(outDir, { recursive: true });

/* ---------- 组 project ---------- */
let project;
let subtitleInfo = null;
if (argv.project) {
  project = JSON.parse(fs.readFileSync(path.resolve(argv.project.replace(/^~/, process.env.HOME)), 'utf8'));
} else {
  project = {};
  if (argv.subtitles) {
    const f = path.resolve(argv.subtitles.replace(/^~/, process.env.HOME));
    if (!fs.existsSync(f)) { console.error('字幕文件不存在：' + f); process.exit(1); }
    subtitleInfo = subtitlesToLyrics(fs.readFileSync(f, 'utf8'), f, argv.lang || 'auto');
    project.lyrics = subtitleInfo.lyrics;
  } else {
    const v = argv.lyrics;
    const asFile = fs.existsSync(path.resolve(v.replace(/^~/, process.env.HOME)));
    project.lyrics = asFile ? fs.readFileSync(path.resolve(v.replace(/^~/, process.env.HOME)), 'utf8') : v.replace(/\\n/g, '\n');
  }
  for (const k of ['style', 'theme', 'lang', 'aspect', 'mood', 'title', 'artist', 'keyBg', 'alphaFormat']) if (argv[k]) project[k] = argv[k];
  for (const k of ['seed', 'res', 'fps']) if (argv[k] !== undefined) project[k] = Number(argv[k]);
  for (const k of ['extra', 'wa', 'horror', 'typo', 'kinetic', 'unify', 'typeset', 'centerFree']) if (argv[k]) project[k] = true;
}

const r = new JizuraRenderer();
const say = (...m) => console.log(...m);
say(`JIZURA ${VERSION.jizura} · ${PARTS.parts.length} 部件`);
if (subtitleInfo) say(`字幕 ${subtitleInfo.format.toUpperCase()} · ${subtitleInfo.lines} 行` +
  (subtitleInfo.dropped ? ` · 去掉 ${subtitleInfo.dropped} 行同时间戳的对照` : ''));

try {
  await r.start();
  const prepared = await r.prepare(project);
  const projectFile = path.join(outDir, 'project.json');
  if (!argv.project) fs.writeFileSync(projectFile, JSON.stringify(prepared.project, null, 1));
  say(`计划 ${prepared.duration.toFixed(2)}s · ${prepared.width}×${prepared.height} · ${prepared.cuts.length} cuts · ${prepared.fps}fps · style ${prepared.project.style} · seed ${prepared.project.seed}`);
  if (prepared.fonts.missing.length) say(`⚠️ 字体缺失 ${prepared.fonts.missing.length} 个：${prepared.fonts.missing.join(', ')}（会回退系统字体）`);

  if (argv.sheet || argv.dry) {
    const sheet = await r.contactSheet({ out: path.join(outDir, 'contact.png'), cols: 4, width: 420 });
    say(`联络图 ${sheet.file}（${sheet.tiles} 格${sheet.sampled ? `，从 ${sheet.totalCuts} 个 cut 取样` : ''}）`);
  }

  if (argv.dry) { say('--dry：只出计划与联络图'); }
  else if (argv.layers) {
    say('开始渲染透明分层（back + front 两趟，帧数 ×2）…');
    const l = await r.renderLayers({ outDir, scale: argv.scale ? Number(argv.scale) : 1, format: argv.alphaFormat || 'png', fps: argv.fps ? Number(argv.fps) : undefined });
    say(`分层 ${l.width}×${l.height} · ${l.frames} 帧`);
    if (l.png) for (const [k, d] of Object.entries(l.png)) say(`  ${k.padEnd(5)} ${d}`);
    say(`  清单 ${l.manifest}`);
  } else {
    // 先说清楚要渲多久：整首 1080p 约 4 分钟，终端没动静时容易以为卡死
    const rate = (argv.fps ? Number(argv.fps) : prepared.fps) || 24;
    const startAt = argv.from ? Number(argv.from) : 0;
    const endAt = argv.to ? Number(argv.to) : prepared.duration;
    const frames = Math.max(1, Math.round((endAt - startAt) * rate));
    const mins = frames * 0.03 / 60;                 // 实测 ~30ms/帧（1080p）
    const eta = mins < 1 ? `${Math.ceil(mins * 60)} 秒` : `${mins.toFixed(1)} 分钟`;
    say(`开始渲染 ${frames} 帧 @${rate}fps（${(endAt - startAt).toFixed(1)}s），预计 ${eta}；完成后接 ffmpeg 编码`);
    say('进度每 2 秒刷新一次，中途没有新行说明还在跑，不要中断');

    let last = 0;
    let encodedAt = 0;
    const v = await r.renderVideo({
      out: path.join(outDir, 'lyrics.mp4'),
      fps: argv.fps ? Number(argv.fps) : undefined,
      scale: argv.scale ? Number(argv.scale) : 1,
      crf: argv.crf ? Number(argv.crf) : 22,
      audio: argv.audio ? path.resolve(argv.audio.replace(/^~/, process.env.HOME)) : null,
      from: argv.from ? Number(argv.from) : 0,
      to: argv.to ? Number(argv.to) : null,
      onProgress: p => {
        const now = Date.now();
        if (now - last < 2000 && p.done !== p.total) return;
        last = now;
        const pct = ((p.done / p.total) * 100).toFixed(0).padStart(3);
        const el = Math.round(p.ms / 1000);
        const left = p.done > 0 ? Math.round((p.ms / p.done) * (p.total - p.done) / 1000) : 0;
        process.stdout.write(`\r  ${pct}%  ${p.done}/${p.total}  已用 ${el}s  剩余 ~${left}s   `);
      },
      onPhase: ph => {
        if (ph.phase !== 'encode') return;
        encodedAt = Date.now();
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
        const area = Math.pow(argv.scale ? Number(argv.scale) : 1, 2);
        const secs = Math.max(3, Math.round(ph.frames * 0.014 * area));   // x264 1080p 实测 ~70fps，按面积缩放
        say(`渲染完成 ${ph.frames} 帧，开始编码（x264，约 ${secs < 60 ? secs + ' 秒' : (secs / 60).toFixed(1) + ' 分钟'}）…`);
        say('这期间没有输出是正常的，编码完才写文件');
      },
    });
    const mb = (fs.statSync(v.file).size / 1048576).toFixed(1);
    const encSec = encodedAt ? Math.round((Date.now() - encodedAt) / 1000) : 0;
    say(`视频 ${v.file} · ${v.frames} 帧 · ${mb} MB${v.audio ? '（含音轨）' : ''}${encSec ? ` · 编码 ${encSec}s` : ''}`);
  }
  say(`输出目录 ${outDir}`);
} catch (err) {
  console.error('失败：' + (err && err.message));
  process.exitCode = 1;
} finally {
  await r.close();
  // 明确退出：Chrome 子进程偶尔会拖住事件循环，导致渲完了还"停不下来"
  process.exit(process.exitCode || 0);
}
