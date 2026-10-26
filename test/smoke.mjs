#!/usr/bin/env node
/* 端到端冒烟：走插件自己的工具对象（不是直接调 lib/render），从歌词一路到 MP4 + 透明分层。
 * node test/smoke.mjs [outDir]
 * 需要 Chrome + ffmpeg。约 1–2 分钟。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'test', '.out'));
fs.rmSync(out, { recursive: true, force: true });

let failed = 0;
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failed++;
};

const registered = new Map();
const ctx = {
  tools: { register(t) { registered.set(t.name, t); return () => {}; } },
  get: key => (key === 'skills' ? { register() { return () => {}; } } : undefined),
  effect(fn) { return fn(); },
  logger: { info() {}, warn: m => console.log('  [warn]', m) },
};
const mod = await import(path.join(root, 'lib/index.js'));
mod.apply(ctx);
const tool = n => registered.get(n);

const LYRICS = '夜明けの色を/覚えてる\nほどけた声が遠くで鳴った\n*透明*なままじゃ終われない!';

console.log('1) jizura_plan（theme: wa，竖屏 720p）');
const t0 = Date.now();
const planText = await tool('jizura_plan').execute({
  lyrics: LYRICS, out: path.join(out, 'plan'), aspect: '9:16', resolution: 720, fps: 24, theme: 'wa',
});
console.log(planText.split('\n').slice(0, 6).map(l => '   ' + l).join('\n'));
console.log(`   …（${((Date.now() - t0) / 1000).toFixed(1)}s）`);

const projectPath = path.join(out, 'plan', 'project.json');
const sheetPath = path.join(out, 'plan', 'contact.png');
ok(fs.existsSync(projectPath), 'project.json 已写出');
ok(fs.existsSync(sheetPath) && fs.statSync(sheetPath).size > 10000, '联络图已渲染', fs.existsSync(sheetPath) ? (fs.statSync(sheetPath).size / 1024).toFixed(0) + ' KB' : '');
const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
ok(project.theme === undefined, 'theme 已展开并从项目里移除（保证可复现）');
ok(project.seed > 0, '项目里有确定的 seed', String(project.seed));
ok(/theme "wa"/.test(planText), '报告里说明了 theme 展开结果');
ok(/字体缺失/.test(planText) === false, '字体齐全（没有回退警告）');

console.log('\n2) jizura_render mode:both（scale 0.5，含 ProRes）');
const t1 = Date.now();
const renderText = await tool('jizura_render').execute({
  projectFile: projectPath, out: path.join(out, 'assets'), mode: 'both', scale: 0.5, crf: 22, alphaFormat: 'prores',
});
console.log(renderText.split('\n').map(l => '   ' + l).join('\n'));
console.log(`   …（${((Date.now() - t1) / 1000).toFixed(1)}s）`);

const video = path.join(out, 'assets', 'lyrics.mp4');
ok(fs.existsSync(video), 'lyrics.mp4 已生成');
if (fs.existsSync(video)) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,nb_frames', '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim();
  const [codec, w, h, frames] = probe.split(',');
  ok(codec === 'h264', '视频是 H.264', codec);
  ok(Number(w) === 540 && Number(h) === 960, '尺寸 = 计划的一半（竖屏 540×960）', `${w}×${h}`);
  ok(Number(frames) > 20, '有实际帧数', frames);
}

const manifestPath = path.join(out, 'assets', 'layers.json');
ok(fs.existsSync(manifestPath), 'layers.json 已生成');
if (fs.existsSync(manifestPath)) {
  const mf = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  ok(mf.kind === 'jizura-alpha-layers', 'kind 正确');
  ok(mf.frames > 20 && mf.fps === 24, '清单里有帧数与 fps', `${mf.frames} @${mf.fps}`);
  ok(mf.width === 540 && mf.height === 960, '清单尺寸与视频一致');
  for (const layer of ['back', 'front']) {
    const dir = path.join(out, 'assets', 'png_' + layer);
    const n = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
    ok(n === mf.frames, `png_${layer} 帧数对得上`, `${n}/${mf.frames}`);
    // alpha 必须真的存在：读第一帧的 alpha 范围
    const first = path.join(dir, 'f00000.png');
    if (fs.existsSync(first)) {
      const pix = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', first], { encoding: 'utf8' }).trim();
      ok(pix === 'rgba', `png_${layer} 是 RGBA`, pix);
    }
  }
}

const frontMov = path.join(out, 'assets', 'lyrics_front_prores4444.mov');
ok(fs.existsSync(frontMov), 'ProRes 4444 已生成', fs.existsSync(frontMov) ? (fs.statSync(frontMov).size / 1048576).toFixed(1) + ' MB' : '');
if (fs.existsSync(frontMov)) {
  const pix = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', frontMov], { encoding: 'utf8' }).trim();
  ok(/yuva/.test(pix), 'ProRes 带 alpha', pix);
}

console.log('\n3) 可复现性：同 projectFile 再渲一次，首帧应逐字节相同');
const r2 = path.join(out, 'repeat');
await tool('jizura_render').execute({ projectFile: projectPath, out: r2, mode: 'layers', scale: 0.5 });
const a = fs.readFileSync(path.join(out, 'assets', 'png_front', 'f00010.png'));
const b = fs.readFileSync(path.join(r2, 'png_front', 'f00010.png'));
ok(a.equals(b), '两次渲染第 10 帧完全一致');

console.log(`\n产物目录：${out}`);
console.log(`${failed === 0 ? '冒烟全部通过 ✅' : failed + ' 项失败 ❌'}`);
process.exit(failed === 0 ? 0 : 1);
