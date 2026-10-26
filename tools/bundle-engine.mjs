#!/usr/bin/env node
/* Bundle the JIZURA browser engine into this plugin.
 *
 *   node tools/bundle-engine.mjs [--repo <path to JIZURA clone>]
 *
 * Writes:
 *   engine/engine.js    concatenation of <repo>/src/*.js in load order (same order build.py uses)
 *   engine/parts.json   the full part catalogue with Japanese + English names
 *   engine/version.json  JIZURA version + git commit + bundle time
 *
 * The engine is vendored so the plugin works without the JIZURA clone on disk.
 * Re-run this only when you want to pick up upstream changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const argv = process.argv.slice(2);
const repoArg = argv.indexOf('--repo');
const repo = path.resolve(repoArg >= 0 ? argv[repoArg + 1] : path.join(root, '..', 'JIZURA'));

if (!fs.existsSync(path.join(repo, 'src'))) {
  console.error(`找不到 JIZURA 源码：${repo}\n用 --repo 指定仓库路径。`);
  process.exit(1);
}

/* ---- 1. engine.js: 按文件名排序拼接（与 build.py 的 sorted(glob('src/*.js')) 一致） ---- */
const files = fs.readdirSync(path.join(repo, 'src')).filter(f => f.endsWith('.js')).sort();
const engine = files.map(f => fs.readFileSync(path.join(repo, 'src', f), 'utf8') + '\n').join('');
fs.mkdirSync(path.join(root, 'engine'), { recursive: true });
fs.writeFileSync(path.join(root, 'engine', 'engine.js'), engine);
console.log(`engine/engine.js  ${(engine.length / 1048576).toFixed(2)} MB  (${files.length} 个模块)`);

/* ---- 2. 在 Node 里加载引擎，导出部件目录 ---- */
const stubCtx = new Proxy({}, { get: (t, k) => (k === 'canvas' ? { width: 1, height: 1 } : k in t ? t[k] : () => {}) });
const mkEl = () => ({
  width: 1, height: 1, style: {}, getContext: () => stubCtx, appendChild() {}, setAttribute() {},
  addEventListener() {}, classList: { add() {}, remove() {} },
});
const g = globalThis;
g.window = g;
g.document = { createElement: mkEl, getElementById: () => null, addEventListener() {}, fonts: { add() {}, ready: { then() {} } }, body: mkEl() };
const define = (k, v) => { try { Object.defineProperty(g, k, { value: v, configurable: true, writable: true }); } catch { g[k] = v; } };
define('navigator', { userAgent: 'node', language: 'ja' });
define('performance', { now: () => 0 });
define('requestAnimationFrame', () => 0);
define('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
define('Image', () => mkEl());

new Function(engine).call(g);
const J = g.J;
if (!J) throw new Error('引擎加载失败：没有拿到 J 命名空间');

const GROUPS = ['layout', 'enter', 'hold', 'exit', 'decor', 'treat', 'bg', 'cam', 'fx', 'trans'];
const pick = (group, key) => (group === 'style' ? J.STYLES[key] : J.registry(group)[key]);

/* 日文名先存下来 */
const jaSlice = () => {
  const out = {};
  for (const gr of GROUPS) for (const k of J.order(gr)) { const d = pick(gr, k); out[`${gr}.${k}`] = { name: d.name, tags: d.tags || [] }; }
  for (const k of J.STYLE_ORDER) out[`style.${k}`] = { name: J.STYLES[k].name, tags: [] };
  return out;
};
const ja = jaSlice();

/* english.js 会把 J.*.name 覆盖成英文 */
const englishJs = path.join(repo, 'app', 'english.js');
if (fs.existsSync(englishJs)) new Function(fs.readFileSync(englishJs, 'utf8')).call(g);

const parts = [];
for (const gr of GROUPS) {
  for (const k of J.order(gr)) {
    const d = pick(gr, k);
    const j = ja[`${gr}.${k}`] || {};
    parts.push({
      group: gr, key: k,
      name: j.name || d.name || k,
      nameEn: d.name && d.name !== j.name ? d.name : undefined,
      tags: (d.tags || []).length ? d.tags : undefined,
      set: d.set || undefined,
      extra: d.extra || undefined,
      wa: d.wa || undefined,
      pack: d.pack || undefined,
      weight: typeof d.w === 'number' ? d.w : undefined,
    });
  }
}
const styles = J.STYLE_ORDER.map(k => {
  const j = ja[`style.${k}`] || {};
  return { key: k, name: j.name || J.STYLES[k].name, nameEn: J.STYLES[k].name !== j.name ? J.STYLES[k].name : undefined,
           desc: J.STYLES[k].desc, set: J.STYLES[k].set, extra: J.STYLES[k].extra };
});
const moods = Object.keys(J.MOODS || {}).map(k => ({ key: k, name: J.MOODS[k].name, nameEn: J.MOODS[k].nameEn }));
const aspects = ['16:9', '9:16', '4:3', '3:4', '1:1', '4:5', '21:9'];

fs.writeFileSync(path.join(root, 'engine', 'parts.json'),
  JSON.stringify({ counts: Object.fromEntries(GROUPS.map(gr => [gr, J.order(gr).length])), groups: GROUPS, parts, styles, moods, aspects }, null, 1));
console.log(`engine/parts.json  ${parts.length} 个部件 / ${styles.length} 个样式`);

/* ---- 3. 版本信息 ---- */
const version = fs.readFileSync(path.join(repo, 'VERSION'), 'utf8').trim();
let commit = null;
try { commit = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
fs.writeFileSync(path.join(root, 'engine', 'version.json'),
  JSON.stringify({ jizura: version, commit, bundledAt: new Date().toISOString(), modules: files }, null, 2));
console.log(`engine/version.json  JIZURA ${version} (${commit || 'no git'})`);
