/* JIZURA render core: project -> frames -> encoded assets.
 * Everything that touches Chrome or ffmpeg lives here; lib/index.js only wires tools to it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HeadlessBrowser, findChrome } from './cdp.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(here, '..');
export const DRIVER_URL = 'file://' + path.join(PLUGIN_ROOT, 'engine', 'driver.html');
export const PARTS = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'engine', 'parts.json'), 'utf8'));
export const VERSION = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'engine', 'version.json'), 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHUNK = 12;                       // 每次 evaluate 回传的帧数（太大容易撑爆 CDP 消息）

export function findFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  return 'ffmpeg';
}

function run(cmd, args, { cwd, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => {
      err += d;
      if (err.length > 80000) err = err.slice(-40000);
      if (onLine) onLine(d.toString());
    });
    child.on('error', e => reject(new Error(`无法执行 ${cmd}: ${e.message}`)));
    child.on('exit', code => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${cmd} 退出码 ${code}\n${err.slice(-1500)}`));
    });
  });
}

async function ffmpegVersion() {
  try {
    const { err, out } = await run(findFfmpeg(), ['-version']);
    return (out + err).split('\n')[0].replace('ffmpeg version ', '').split(' ')[0];
  } catch { return null; }
}

export function tmpDir(tag = 'jizura') {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${tag}-`));
}

/* ------------------------------------------------------------------ renderer */

export class JizuraRenderer {
  constructor(opts = {}) {
    this.browserOpts = opts;
    this.browser = null;
    this.plan = null;         // prepare() 的结果
    this.project = null;
  }

  async start() {
    if (this.browser) return this;
    this.browser = new HeadlessBrowser(this.browserOpts);
    await this.browser.start();
    await this.browser.open(DRIVER_URL);
    return this;
  }

  async close() {
    if (this.browser) { await this.browser.close(); this.browser = null; }
  }

  /** 建立计划，返回 { duration, width, height, cuts[], fonts } */
  async prepare(project) {
    await this.start();
    this.project = project;
    this.plan = await this.browser.evaluate(`JZ.prepare(${JSON.stringify(project)})`, { timeout: 180000 });
    return this.plan;
  }

  /** 渲染指定时间点；返回文件路径数组 */
  async framesToFiles(times, dir, opt = {}, onProgress) {
    if (!this.plan) throw new Error('先调用 prepare()');
    fs.mkdirSync(dir, { recursive: true });
    const ext = opt.format === 'png' || opt.transparent ? 'png' : 'jpg';
    const written = [];
    const total = times.length;
    const t0 = Date.now();
    for (let i = 0; i < times.length; i += CHUNK) {
      const batch = times.slice(i, i + CHUNK);
      const res = await this.browser.evaluate(
        `JZ.frames(${JSON.stringify(batch)}, ${JSON.stringify(opt)})`,
        { timeout: 300000 },
      );
      const urls = res.frames;
      for (let k = 0; k < urls.length; k++) {
        const b64 = urls[k].slice(urls[k].indexOf(',') + 1);
        const file = path.join(dir, `f${String(i + k).padStart(5, '0')}.${ext}`);
        fs.writeFileSync(file, Buffer.from(b64, 'base64'));
        written.push(file);
      }
      if (onProgress) onProgress({ done: Math.min(i + batch.length, total), total, ms: Date.now() - t0 });
    }
    return written;
  }

  /** 采样整片的时间点 */
  sampleTimes(duration, fps, every = 1) {
    const n = Math.max(1, Math.round(duration * fps / every));
    const out = [];
    for (let i = 0; i < n; i++) out.push(Math.min(duration - 1e-4, (i * every) / fps));
    return out;
  }

  /* ---------------------------------------------------------------- 成片 MP4 */

  async renderVideo({ out, fps, scale = 1, crf = 18, audio = null, preset = 'medium', onProgress } = {}) {
    await this.prepare(this.project);        // 重置到播种起点：每趟渲染互不污染
    const plan = this.plan;
    const rate = fps || this.project.fps || 24;
    const work = tmpDir('jizura-video');
    const outFile = path.resolve(out);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    try {
      const times = this.sampleTimes(plan.duration, rate);
      await this.framesToFiles(times, work, { scale, format: 'jpeg', quality: 0.95 }, onProgress);
      const args = [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-framerate', String(rate), '-i', path.join(work, 'f%05d.jpg'),
      ];
      if (audio) args.push('-i', path.resolve(audio));
      args.push(
        '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      );
      if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
      args.push(outFile);
      await run(findFfmpeg(), args);
      return { file: outFile, frames: times.length, fps: rate, audio: !!audio };
    } finally {
      try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    }
  }

  /* ------------------------------------------------- 透明分层（给 HyperFrames 用） */

  /**
   * 导出 前景/后景 透明素材。
   *   format: 'png'  (默认) 前景/后景各一个 PNG 序列目录 + manifest.json —— HyperFrames 用 canvas 逐帧播放，帧精确、无损
   *           'prores' 额外再编一个 ProRes 4444 .mov（Alpha 保留，给 AE / Resolve / FCP）
   *   注：不在选项里提供 VP9 alpha webm —— ffmpeg 的 VP9 透明通道在部分构建下会被静默丢弃，
   *       与其给一个可能是实心底的 webm，不如给确定正确的 PNG。
   */
  async renderLayers({ outDir, fps, scale = 1, format = 'png', crf = 30, keepPng = true, onProgress } = {}) {
    await this.prepare(this.project);        // 同上
    const plan = this.plan;
    const rate = fps || this.project.fps || 24;
    const target = path.resolve(outDir || '.');
    fs.mkdirSync(target, { recursive: true });
    const work = tmpDir('jizura-layers');
    const produced = { back: null, front: null, png: null };
    try {
      const times = this.sampleTimes(plan.duration, rate);
      for (const layer of ['back', 'front']) {
        const dir = path.join(work, layer);
        await this.framesToFiles(times, dir, { scale, transparent: true, layer, format: 'png' }, p => {
          if (onProgress) onProgress({ layer, ...p });
        });
        const base = path.join(target, `lyrics_${layer}`);
        if (format === 'prores') {
          produced[layer] = `${base}_prores4444.mov`;
          await run(findFfmpeg(), ['-y', '-hide_banner', '-loglevel', 'error',
            '-framerate', String(rate), '-i', path.join(dir, 'f%05d.png'),
            '-vf', 'format=yuva444p10le', '-c:v', 'prores_ks', '-profile:v', '4444',
            produced[layer]]);
        }
        if (keepPng || format === 'png') {
          const pd = path.join(target, `png_${layer}`);
          fs.mkdirSync(pd, { recursive: true });
          const files = fs.readdirSync(dir).sort();
          files.forEach((f, i) => fs.copyFileSync(path.join(dir, f), path.join(pd, `f${String(i).padStart(5, '0')}.png`)));
          produced.png = produced.png || {};
          produced.png[layer] = pd;
        }
      }
      produced.duration = +plan.duration.toFixed(3);
      produced.fps = rate;
      produced.width = Math.round((plan.W || plan.width) * scale);
      produced.height = Math.round((plan.H || plan.height) * scale);
      produced.frames = times.length;
      // manifest：HyperFrames 侧按这个 JSON 逐帧取图，不靠目录列举顺序
      const manifest = {
        kind: 'jizura-alpha-layers', jizura: VERSION.jizura,
        width: produced.width, height: produced.height, fps: rate,
        frames: times.length, duration: produced.duration,
        sequences: produced.png || null, prores: format === 'prores' ? { back: produced.back, front: produced.front } : null,
      };
      const mf = path.join(target, 'layers.json');
      fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));
      produced.manifest = mf;
      return produced;
    } finally {
      try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    }
  }

  /* ---------------------------------------------------------------- 联络图 */

  /** 每个 cut 抽一帧拼成 grid，方便一眼审片 */
  async contactSheet({ out, cols = 4, width = 480, perCut = 1 } = {}) {
    const plan = this.plan;
    const work = tmpDir('jizura-sheet');
    const outFile = path.resolve(out);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    try {
      const times = [];
      for (const c of plan.cuts) {
        const span = c.end - c.start;
        for (let k = 0; k < perCut; k++) times.push(c.start + span * ((k + 0.55) / (perCut + 0.1)));
      }
      await this.framesToFiles(times, work, { scale: 1, format: 'jpeg', quality: 0.9 });
      const rows = Math.ceil(times.length / cols);
      await run(findFfmpeg(), ['-y', '-hide_banner', '-loglevel', 'error',
        '-framerate', '1', '-i', path.join(work, 'f%05d.jpg'),
        '-vf', `scale=${width}:-1,tile=${cols}x${rows}:padding=6:margin=6:color=0x181818`,
        '-frames:v', '1', outFile]);
      return { file: outFile, tiles: times.length, cols, rows };
    } finally {
      try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    }
  }
}

/* ------------------------------------------------------------------ helpers */

export async function environmentReport() {
  const chrome = findChrome();
  const ff = await ffmpegVersion();
  return {
    chrome, chromeOk: !!chrome,
    ffmpeg: ff, ffmpegOk: !!ff,
    jizura: VERSION.jizura, jizuraCommit: VERSION.commit,
    parts: Object.values(PARTS.counts).reduce((a, b) => a + b, 0),
    styles: PARTS.styles.length,
    platform: `${process.platform} ${process.arch}`,
    node: process.version,
  };
}
