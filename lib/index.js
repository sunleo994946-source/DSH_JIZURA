/**
 * dsh-jizura — JIZURA lyric-motion engine as DSH tools + a HyperFrames handoff skill.
 *
 *   jizura_parts   browse the 860 parts / 27 styles (no browser)
 *   jizura_plan    lyrics -> cut plan + contact sheet
 *   jizura_render  plan -> MP4, or transparent front/back layers for HyperFrames
 *   jizura_health  environment check (Chrome, ffmpeg, engine version)
 *
 * Rendering runs in headless Chrome (the real engine, unmodified) and encodes with ffmpeg.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JizuraRenderer, PARTS, VERSION, environmentReport } from './render.js';
import { subtitlesToLyrics } from './subtitles.js';

export const name = 'dsh-jizura';
export const inject = ['tools'];

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_NAME = 'jizura-hyperframes';
const IDLE_CLOSE_MS = 5 * 60 * 1000;      // 浏览器闲这么久就关掉，别一直占着 ~200MB

/* ------------------------------------------------------------------ state */

let renderer = null;
let idleTimer = null;
let chain = Promise.resolve();

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    idleTimer = null;
    if (!renderer) return;
    const r = renderer;
    renderer = null;
    try { await r.close(); } catch {}
  }, IDLE_CLOSE_MS);
  if (idleTimer.unref) idleTimer.unref();
}

/* 同一时刻只跑一个渲染任务：一个浏览器 + 一个页面，没有并发可言 */
function exclusive(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

async function withRenderer(fn) {
  return exclusive(async () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    let fresh = false;
    if (!renderer) { renderer = new JizuraRenderer(); await renderer.start(); fresh = true; }
    try {
      return await fn(renderer);
    } catch (err) {
      // 浏览器崩了就把实例丢掉，下次调用重新起一个
      const dead = /CDP|WebSocket|Target closed|页面内异常|Chrome/.test(String(err && err.message));
      if (dead) { try { await renderer.close(); } catch {} renderer = null; }
      throw err;
    } finally {
      if (renderer) scheduleIdleClose();
    }
  });
}

/* ------------------------------------------------------------------ helpers */

const resolvePath = p => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));

function slugify(text, fallback = 'jizura') {
  const first = String(text || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  const s = first.replace(/[*\[\]()（）「」【】!?！？、。，,./\\|]/g, '').replace(/\s+/g, '-').slice(0, 32);
  return s || fallback;
}

const PROJECT_FIELDS = [
  'title', 'artist', 'style', 'mood', 'aspect', 'seed', 'lang', 'extra', 'wa', 'horror',
  'typo', 'kinetic', 'unify', 'typeset', 'centerFree', 'centerDir', 'keyBg', 'overrides', 'timing', 'fx', 'enabled',
];

/** 把工具参数收成一个 JIZURA project（只放用户真的给了的字段，其余由引擎默认值接管） */
function buildProject(args = {}) {
  const project = {};
  if (typeof args.lyrics === 'string') project.lyrics = args.lyrics;
  else if (typeof args.lyrics !== 'string' && !args.projectFile) throw new Error('需要 lyrics（歌词文本，一行一句）');
  for (const f of PROJECT_FIELDS) if (args[f] !== undefined && args[f] !== null) project[f] = args[f];
  if (args.resolution !== undefined) project.res = args.resolution;
  if (args.theme) project.theme = args.theme;
  return project;
}

/** 拿字幕：可以是文件路径（.srt/.lrc/.vtt/.txt），也可以直接贴内容 */
function readSubtitles(input) {
  const looksLikeContent = /-->|^\[\d{1,3}:\d{2}/m.test(input) && !fs.existsSync(resolvePath(input));
  if (looksLikeContent) return { ...subtitlesToLyrics(input, ''), source: '(直接贴入)' };
  const file = resolvePath(input);
  if (!fs.existsSync(file)) throw new Error('字幕文件不存在：' + file);
  const text = fs.readFileSync(file, 'utf8');
  return { ...subtitlesToLyrics(text, file), source: file };
}

const fmtTime = t => {
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(2).padStart(5, '0');
  return m ? `${m}:${s}` : `${s}s`;
};

function cutsTable(cuts, limit = 40) {
  const rows = cuts.slice(0, limit).map(c =>
    `  ${String(c.index).padStart(2)}  ${fmtTime(c.start).padStart(7)}–${fmtTime(c.end).padEnd(7)} ` +
    `${String(c.text || '(间奏)').slice(0, 18).padEnd(18)} ${c.layout}/${c.enter}/${c.hold}/${c.exit}` +
    `${c.decor.length ? '  decor: ' + c.decor.join('+') : ''}${c.bg !== 'none' ? '  bg: ' + c.bg : ''}`);
  if (cuts.length > limit) rows.push(`  … 还有 ${cuts.length - limit} 个 cut`);
  return rows.join('\n');
}

function planReport(prepared, paths, subtitle) {
  const { duration, width, height, cuts, fonts, project, omakase } = prepared;
  const lines = [];
  lines.push(`JIZURA 计划：${duration.toFixed(2)}s / ${width}×${height} / ${cuts.length} cuts / ${project.fps}fps`);
  lines.push(`风格 ${project.style}${project.mood ? ' · 情绪 ' + project.mood : ''} · seed ${project.seed} · 语言 ${project.lang}`);
  if (omakase) lines.push(`（theme "${omakase.theme}" 已展开为 style=${omakase.style} / mood=${omakase.mood} / seed=${omakase.seed}）`);
  if (subtitle) {
    const span = subtitle.first !== null ? ` · 首行 ${fmtTime(subtitle.first)} → 末行 ${fmtTime(subtitle.last)}` : '';
    lines.push(`字幕 ${subtitle.format.toUpperCase()} · ${subtitle.lines} 行（带时间 ${subtitle.timed} 行）${span}`);
    lines.push(`来源 ${subtitle.source}`);
  }
  if (fonts.missing.length) {
    lines.push('');
    lines.push(`⚠️ 字体缺失 ${fonts.missing.length} 个：${fonts.missing.join(', ')}`);
    lines.push('   这些会静默回退系统字体，画面和样式包的设计不一致。先解决网络或字体再渲。');
  }
  lines.push('');
  lines.push('cuts（序号  起–止  文本  版面/入场/待机/退场  …）');
  lines.push(cutsTable(cuts));
  lines.push('');
  lines.push(`联络图：${paths.sheet}`);
  lines.push(`项目文件：${paths.project}（可原样传给 jizura_render 的 projectFile）`);
  return lines.join('\n');
}

/* ------------------------------------------------------------------ tools */

const partsTool = {
  name: 'jizura_parts',
  description:
    '查询 JIZURA 的部件目录（860 个部件 / 27 个样式包 / 8 种情绪），不需要启动浏览器。' +
    '在给用户描述风格、或要往 overrides 里填具体部件 key 之前先查这里，不要凭印象编 key。' +
    'group 可不填（列全部组的计数）；query 匹配 key、日文名、英文名和标签。',
  parameters: {
    type: 'object',
    properties: {
      group: { type: 'string', enum: [...PARTS.groups, 'style', 'mood'], description: '只查某一组；不填 = 全部组计数' },
      query: { type: 'string', description: '关键词，匹配 key / 日文名 / 英文名 / 标签，例如 "vertical"、"glitch"、"和風"' },
      set: { type: 'string', enum: ['base', 'extra', 'typo', 'kinetic', 'horror', 'wa'], description: '按部品セット过滤；base = 首版基础集' },
      limit: { type: 'number', description: '最多返回多少条（默认 60，上限 300）' },
    },
  },
  execute: async (args = {}) => {
    const limit = Math.min(300, Math.max(1, args.limit || 60));
    const q = (args.query || '').trim().toLowerCase();
    const countLine = PARTS.groups.map(g => `${g} ${PARTS.counts[g]}`).join(' · ');

    if (args.group === 'mood') {
      return '情绪（mood）：\n' + PARTS.moods.map(m => `  ${m.key.padEnd(10)} ${m.nameEn || m.name}`).join('\n');
    }

    let pool;
    if (args.group === 'style') pool = PARTS.styles.map(s => ({ ...s, group: 'style' }));
    else pool = PARTS.parts.filter(p => !args.group || p.group === args.group);

    if (args.set) {
      pool = pool.filter(p => {
        if (args.set === 'base') return !p.set && !p.extra;
        if (args.set === 'wa') return !!p.wa;
        if (args.set === 'extra') return !!p.extra;
        return p.set === args.set;
      });
    }
    if (q) {
      pool = pool.filter(p =>
        [p.key, p.name, p.nameEn, p.desc, ...(p.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(q));
    }

    if (!args.group && !q && !args.set) {
      return `JIZURA 部件目录（JIZURA ${VERSION.jizura}）\n${countLine}\n样式 ${PARTS.styles.length} · 情绪 ${PARTS.moods.length}\n\n` +
        '按组查询：jizura_parts { group: "layout" }；按关键词：jizura_parts { query: "vertical" }。\n' +
        '更多判断依据（哪组什么时候用、样式包怎么挑）见技能 jizura-hyperframes 的 references/parts.md。';
    }

    const head = `匹配 ${pool.length} 条${pool.length > limit ? `（显示前 ${limit}）` : ''}`;
    const rows = pool.slice(0, limit).map(p => {
      const tag = p.group === 'style'
        ? `${p.key.padEnd(12)} ${String(p.nameEn || p.name).padEnd(22)} ${(p.set || (p.extra ? 'extra' : 'base')).padEnd(8)} ${(p.desc || '').slice(0, 70)}`
        : `${p.group.padEnd(6)} ${p.key.padEnd(16)} ${String(p.name).padEnd(14)} ${String(p.nameEn || '').padEnd(22)}` +
          `${(p.set || (p.extra ? 'extra' : p.wa ? 'wa' : 'base')).padEnd(8)}${(p.tags || []).join(',')}`;
      return '  ' + tag.trimEnd();
    });
    return [head, '', ...rows].join('\n');
  },
};

const planTool = {
  name: 'jizura_plan',
  description:
    '把歌词编成 JIZURA 的 cut 计划，并渲染一张每 cut 一帧的联络图（contact sheet）。' +
    '这是"先看一眼再渲"的检查点：计划、风格、字体状态和联络图一起回来。' +
    '歌词语法：换行 = 一句；"/" 手动切；"*词*" 强调；"!" 冲击；"[interlude 8]" 8 秒间奏；"[01:23.45]歌词" 带 LRC 时间。' +
    '也可以直接喂字幕文件：subtitles 传 .srt / .lrc / .vtt / .txt 的路径（或直接贴内容），会自动转成带时间的歌词。' +
    'theme 会触发 おまかせ（随机化风格/情绪/开关），不给 theme 就给 style 自己定；两者都不给用引擎默认。',
  parameters: {
    type: 'object',
    properties: {
      lyrics: { type: 'string', description: '歌词文本，一行一句。与 subtitles 二选一' },
      subtitles: { type: 'string', description: '.srt / .lrc / .vtt / .txt 字幕文件路径（也可直接贴内容）。时间戳会转成 JIZURA 的行首时间' },
      out: { type: 'string', description: '输出目录（相对路径按工作区解析），默认 jizura-out/<歌词首句>' },
      aspect: { type: 'string', enum: PARTS.aspects, description: '画面比，默认 16:9' },
      resolution: { type: 'number', description: '画面高度 720/1080/1440/2160，默认 1080' },
      fps: { type: 'number', description: '默认 24' },
      seed: { type: 'number', description: '整体编排的种子：同 seed 同画面。换 seed 是探索变体最便宜的方式' },
      style: { type: 'string', description: '样式包 key（用 jizura_parts group:"style" 查），例如 noir / paper / sumi / synth80' },
      theme: { type: 'string', enum: ['lyricpv', 'kinetic', 'wa', 'horror', 'pop', 'ballad'], description: 'おまかせ 主题：会随机出一个符合方向的风格组合' },
      lang: { type: 'string', enum: ['auto', 'ja', 'zh-Hant', 'zh-Hans', 'ko', 'en'], description: '歌词语言：决定每个字体角色换成哪种文字的face。非日文务必显式指定' },
      extra: { type: 'boolean', description: '允许抽选 追加分（后加的 351 个部件 + 15 个样式）' },
      wa: { type: 'boolean', description: '允许和風母题（提灯/障子/家紋/青海波…）' },
      horror: { type: 'boolean', description: '启用恐怖部品集（会接管情绪，非要求勿开）' },
      typo: { type: 'boolean', description: '启用文字PV系部件（默认开）' },
      kinetic: { type: 'boolean', description: '启用キネティック部件（默认开）' },
      unify: { type: 'boolean', description: '统一感：重复句长得一样、方向交替' },
      typeset: { type: 'boolean', description: '文字整列：假名收紧、助词变小、首字变大' },
      centerFree: { type: 'boolean', description: '中央留空（给人物/口播留位置）' },
      keyBg: { type: 'string', enum: ['off', 'green', 'black'], description: '合成用背景：green/black 出抠像素材（黑底可用 screen 混合）' },
      overrides: { type: 'object', description: '按行号（0 起）指定：{ "0": { layout, enter, hold, exit, decor: [], treat, bg, cam, trans, cuts, single } }' },
    },
  },
  execute: async (args = {}) => {
    let subtitle = null;
    if (args.subtitles) {
      subtitle = readSubtitles(args.subtitles);
      args = { ...args, lyrics: subtitle.lyrics };
    }
    const project = buildProject(args);
    const outDir = resolvePath(args.out || path.join('jizura-out', slugify(args.lyrics)));
    fs.mkdirSync(outDir, { recursive: true });
    const projectPath = path.join(outDir, 'project.json');
    const sheetPath = path.join(outDir, 'contact.png');

    const prepared = await withRenderer(async r => {
      const prepared = await r.prepare(project);
      fs.writeFileSync(projectPath, JSON.stringify(prepared.project, null, 1));
      const cols = prepared.cuts.length <= 4 ? 2 : prepared.cuts.length <= 9 ? 3 : 4;
      await r.contactSheet({ out: sheetPath, cols, width: 420 });
      return prepared;
    });

    return planReport(prepared, { sheet: sheetPath, project: projectPath }, subtitle);
  },
};

const renderTool = {
  name: 'jizura_render',
  description:
    '把 JIZURA 计划渲染成素材。mode:"video" 出 H.264 MP4（可混音）；mode:"layers" 出透明前景/后景 PNG 序列 + layers.json（给 HyperFrames 合成）；' +
    '"both" 全出。1080p 渲速约实时，长歌会跑几分钟。渲染前应该先用 jizura_plan 看过联络图。',
  parameters: {
    type: 'object',
    properties: {
      projectFile: { type: 'string', description: 'jizura_plan 写出的 project.json（推荐：可复现）' },
      project: { type: 'object', description: '或者直接给项目对象（字段同 jizura_plan）' },
      out: { type: 'string', description: '输出目录（相对路径按工作区解析）' },
      mode: { type: 'string', enum: ['video', 'layers', 'both'], description: '默认 video' },
      fps: { type: 'number', description: '覆盖项目里的帧率' },
      scale: { type: 'number', description: '分辨率倍数，默认 1（等于计划的尺寸），0.5 = 半尺寸快速预览' },
      audio: { type: 'string', description: 'mode:video 时混入的音轨路径（mp3/wav/m4a）' },
      crf: { type: 'number', description: 'x264 质量，默认 18，越小越好' },
      alphaFormat: { type: 'string', enum: ['png', 'prores'], description: 'mode:layers：png 出序列（默认），prores 额外编 ProRes 4444 .mov' },
    },
    required: ['out'],
  },
  execute: async (args = {}) => {
    let project;
    if (args.projectFile) {
      const p = resolvePath(args.projectFile);
      if (!fs.existsSync(p)) throw new Error('projectFile 不存在：' + p);
      project = JSON.parse(fs.readFileSync(p, 'utf8'));
    } else if (args.project) {
      project = buildProject(args.project);
    } else {
      throw new Error('需要 projectFile 或 project');
    }
    const mode = args.mode || 'video';
    const out = resolvePath(args.out);
    fs.mkdirSync(out, { recursive: true });
    const scale = args.scale || 1;

    const result = await withRenderer(async r => {
      const prepared = await r.prepare(project);
      const outInfo = { duration: prepared.duration, width: prepared.width, height: prepared.height, cuts: prepared.cuts.length };
      if (mode === 'video' || mode === 'both') {
        outInfo.video = await r.renderVideo({
          out: path.join(out, 'lyrics.mp4'),
          fps: args.fps, scale, crf: args.crf, audio: args.audio,
        });
      }
      if (mode === 'layers' || mode === 'both') {
        outInfo.layers = await r.renderLayers({
          outDir: out, fps: args.fps, scale, format: args.alphaFormat || 'png', keepPng: true,
        });
      }
      return outInfo;
    });

    const lines = [`JIZURA 渲染完成：${result.duration.toFixed(2)}s / ${result.cuts} cuts / 输出 ${out}`];
    if (result.video) {
      const mb = (fs.statSync(result.video.file).size / 1048576).toFixed(1);
      lines.push(`  视频  ${result.video.file}  ${result.video.frames} 帧 @${result.video.fps}fps  ${mb} MB${result.video.audio ? '（含音轨）' : ''}`);
    }
    if (result.layers) {
      lines.push(`  分层  ${result.layers.width}×${result.layers.height} @${result.layers.fps}fps  ${result.layers.frames} 帧`);
      if (result.layers.png) {
        for (const [k, dir] of Object.entries(result.layers.png)) {
          const n = fs.readdirSync(dir).length;
          lines.push(`    ${k.padEnd(6)} ${dir}  (${n} 张 PNG，带 alpha)`);
        }
      }
      if (result.layers.back && String(result.layers.back).endsWith('.mov')) lines.push(`    prores ${result.layers.back}`);
      if (result.layers.front && String(result.layers.front).endsWith('.mov')) lines.push(`    prores ${result.layers.front}`);
      lines.push(`    清单   ${result.layers.manifest}`);
      lines.push('');
      lines.push('交给 HyperFrames：见技能 jizura-hyperframes 的 references/handoff.md（含逐帧 canvas 播放器和合成配方）。');
    }
    return lines.join('\n');
  },
};

const healthTool = {
  name: 'jizura_health',
  description: 'JIZURA 插件自检：Chrome / ffmpeg / 引擎版本 / 部件数 / 技能文件是否完整。渲染出问题时先跑这个。',
  parameters: { type: 'object', properties: {} },
  execute: async () => {
    const env = await environmentReport();
    const skillFile = path.join(PLUGIN_ROOT, 'skills', SKILL_NAME, 'SKILL.md');
    const skillOk = fs.existsSync(skillFile);
    const lines = [
      `dsh-jizura 自检`,
      `  引擎      JIZURA ${env.jizura} (${env.jizuraCommit || 'no git'})  ${env.parts} 部件 / ${env.styles} 样式`,
      `  Chrome    ${env.chromeOk ? '✅ ' + env.chrome : '❌ 找不到（设 CHROME_PATH）'}`,
      `  ffmpeg    ${env.ffmpegOk ? '✅ ' + env.ffmpeg : '❌ 找不到（设 FFMPEG_PATH 或装 ffmpeg）'}`,
      `  技能      ${skillOk ? '✅ ' + skillFile : '❌ 缺少 SKILL.md'}`,
      `  运行时    node ${env.node} · ${env.platform}`,
      `  浏览器    ${renderer ? '已启动（空闲 5 分钟后自动关闭）' : '未启动（首次渲染时启动）'}`,
    ];
    return lines.join('\n');
  },
};

/* ------------------------------------------------------------------ skill */

function readSkill() {
  const dir = path.join(PLUGIN_ROOT, 'skills', SKILL_NAME);
  const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
  const m = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) throw new Error('SKILL.md 缺少 YAML frontmatter');
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z_]+):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    fm[kv[1]] = v;
  }
  if (fm.name !== SKILL_NAME) throw new Error(`SKILL.md 的 name（${fm.name}）与目录名 ${SKILL_NAME} 不一致`);
  if (!fm.description) throw new Error('SKILL.md 缺少 description');
  return { name: fm.name, description: fm.description, content: text.slice(m[0].length).trimStart(), dir };
}

/* 给宿主/测试显式收掉浏览器（正常情况靠空闲计时器和 dispose 就够） */
export async function closeBrowser() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const r = renderer;
  renderer = null;
  if (r) await r.close();
}

export function apply(ctx) {
  ctx.effect(() => ctx.tools.register(partsTool));
  ctx.effect(() => ctx.tools.register(planTool));
  ctx.effect(() => ctx.tools.register(renderTool));
  ctx.effect(() => ctx.tools.register(healthTool));

  // 技能注册表是可选依赖：没装也不能让整个插件停在等待态
  const skills = typeof ctx.get === 'function' ? ctx.get('skills') : undefined;
  if (skills && typeof skills.register === 'function') {
    try {
      const skill = readSkill();
      ctx.effect(() => skills.register({
        name: skill.name,
        description: skill.description,
        content: skill.content,
        resourceBase: { kind: 'directory', path: skill.dir },
        source: 'runtime',
      }));
    } catch (err) {
      if (ctx.logger && ctx.logger.warn) ctx.logger.warn('[dsh-jizura] 技能注册失败：' + (err && err.message));
    }
  }

  // 插件卸载 / 宿主退出时收掉浏览器
  ctx.effect(() => () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    const r = renderer;
    renderer = null;
    if (r) Promise.resolve(r.close()).catch(() => {});
  });

  if (ctx.logger && ctx.logger.info) {
    ctx.logger.info(`[dsh-jizura] JIZURA ${VERSION.jizura} 引擎就绪：${Object.values(PARTS.counts).reduce((a, b) => a + b, 0)} 个部件 + 技能 ${SKILL_NAME}`);
  }
}
