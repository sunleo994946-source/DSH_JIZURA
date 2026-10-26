#!/usr/bin/env node
/* dsh-jizura 安装器
 *
 *   npx github:sunleo994946-source/DSH_JIZURA install     # 装进 DSH
 *   npx github:sunleo994946-source/DSH_JIZURA doctor      # 体检，不改任何东西
 *   npx github:sunleo994946-source/DSH_JIZURA uninstall   # 卸载
 *
 * 装一个 DSH 插件要动两处，缺一不可：
 *   1. profile 的 dependencies 里要有这个包（pnpm 装进 node_modules）
 *   2. profile 的 dsh.profile.bundles 里要有包名（loader 靠它加载 patch）
 * `dsh plugin add` 只做第 1 步，这个脚本两步一起做。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const PKG = 'dsh-jizura';
const DEFAULT_SPEC = 'github:sunleo994946-source/DSH_JIZURA';
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const PROFILES = path.join(DSH_HOME, 'profiles');

/* ---------------------------------------------------------------- 参数 */
const argv = process.argv.slice(2);
const cmd = argv[0] || 'install';
const flag = (name, fallback = null) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = name => argv.includes('--' + name);
const dryRun = has('dry-run');

const c = {
  ok: s => `\x1b[32m${s}\x1b[0m`,
  bad: s => `\x1b[31m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`,
};
const say = (...a) => console.log(...a);
const die = msg => { console.error(c.bad('✗ ') + msg); process.exit(1); };

/* ---------------------------------------------------------------- profile */
function listProfiles() {
  if (!fs.existsSync(PROFILES)) return [];
  return fs.readdirSync(PROFILES).filter(d => fs.existsSync(path.join(PROFILES, d, 'package.json')));
}

function pickProfile() {
  const explicit = flag('profile');
  if (explicit) {
    const dir = path.join(PROFILES, explicit);
    if (!fs.existsSync(path.join(dir, 'package.json'))) die(`profile 不存在：${dir}`);
    return { name: explicit, dir };
  }
  const all = listProfiles();
  if (!all.length) die(`没找到任何 DSH profile（${PROFILES}）。先启动一次 DSH 让它生成 profile。`);
  // desktop 是图形界面的那个；其次是 web；都没有就用第一个
  const name = all.includes('desktop') ? 'desktop' : all.includes('web') ? 'web' : all[0];
  if (all.length > 1) say(c.dim(`（检测到 ${all.length} 个 profile：${all.join(', ')}；用 ${name}，可用 --profile 指定）`));
  return { name, dir: path.join(PROFILES, name) };
}

function readProfile(dir) {
  const file = path.join(dir, 'package.json');
  const raw = fs.readFileSync(file, 'utf8');
  return { file, raw, json: JSON.parse(raw), indent: /^\s*\{[\s\S]*?\n(\s+)"/.exec(raw)?.[1]?.length || 2 };
}

/* ---------------------------------------------------------------- pnpm */
function findPnpm() {
  const fromPath = spawnSync('pnpm', ['--version'], { encoding: 'utf8' });
  if (fromPath.status === 0) return { cmd: 'pnpm', args: [] };
  // DSH 自带 pnpm（macOS / Windows / Linux 打包位置）
  const candidates = [
    '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/pnpm/bin/pnpm.mjs',
    path.join(DSH_HOME, 'dsh-runtimes/dsh-primary-runtime/dependencies/pnpm/bin/pnpm.mjs'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs/DeepSeek Harness/resources/runtime/pnpm/bin/pnpm.mjs'),
    '/opt/DeepSeek Harness/resources/runtime/pnpm/bin/pnpm.mjs',
  ];
  const script = candidates.find(p => p && fs.existsSync(p));
  if (script) return { cmd: process.execPath, args: [script] };
  return null;
}

/* ---------------------------------------------------------------- 检查项 */
function checkChrome() {
  const list = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  return list.find(p => fs.existsSync(p)) || null;
}

function checkFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  const r = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (r.status === 0) return (r.stdout.split('\n')[0] || 'ffmpeg').slice(0, 40);
  return null;
}

/* ---------------------------------------------------------------- 命令 */
function doctor() {
  const { name, dir } = pickProfile();
  const { json } = readProfile(dir);
  const deps = json.dependencies || {};
  const bundles = json.dsh?.profile?.bundles || [];
  const pnpm = findPnpm();
  const chrome = checkChrome();
  const ffmpeg = checkFfmpeg();
  const installed = !!deps[PKG];
  const inBundles = bundles.includes(PKG);
  const linked = installed && String(deps[PKG]).startsWith('link:')
    ? fs.existsSync(path.resolve(dir, String(deps[PKG]).slice(5)))
    : true;

  const line = (ok, label, detail) => say(`  ${ok ? c.ok('✓') : c.bad('✗')} ${label.padEnd(26)}${detail || ''}`);

  say(c.b(`dsh-jizura 体检`) + c.dim(`  profile: ${name}`));
  line(true, 'DSH profile', dir);
  line(!!pnpm, 'pnpm', pnpm ? (pnpm.cmd === 'pnpm' ? 'PATH 上的 pnpm' : pnpm.args[0]) : '未找到（装 pnpm 或先启动一次 DSH）');
  line(!!chrome, 'Chrome / Chromium', chrome || '未找到，装 Chrome 或设 CHROME_PATH');
  line(!!ffmpeg, 'ffmpeg', ffmpeg || '未找到，brew install ffmpeg 或设 FFMPEG_PATH');
  say('');
  line(installed, '依赖已登记', installed ? deps[PKG] : `缺 ${PKG}`);
  line(inBundles, 'bundles 已登记', inBundles ? '好了' : `缺 ${PKG}（loader 不会加载它）`);
  line(linked, '依赖路径存在', linked ? '' : 'link: 指向的目录不在了');
  const nodeDep = path.join(dir, 'node_modules', PKG);
  line(fs.existsSync(nodeDep), 'node_modules 里已安装', fs.existsSync(nodeDep) ? nodeDep : '需要跑一次安装');

  const ready = installed && inBundles && fs.existsSync(nodeDep) && chrome && ffmpeg;
  say('');
  say(ready ? c.ok('全部就绪，重启 DSH 后可用。') : c.bad('还有项目没满足，见上面 ✗ 的行。'));
  if (ready) say(c.dim('重启 DSH 然后在会话里调用 jizura_health 确认。'));
  return ready ? 0 : 1;
}

function install() {
  const { name, dir } = pickProfile();
  const { file, json } = readProfile(dir);
  const spec = flag('link') ? 'link:' + path.resolve(flag('link')) : (flag('spec') || DEFAULT_SPEC);

  say(c.b('安装 dsh-jizura') + c.dim(`  → profile: ${name}`));
  say(c.dim(`  package: ${spec}`));

  // 1) dependencies
  json.dependencies = json.dependencies || {};
  const had = json.dependencies[PKG];
  json.dependencies[PKG] = spec;
  say(`  ${had ? '更新' : '添加'} dependencies.${PKG} = ${spec}`);

  // 2) bundles（这一项 dsh plugin add 不会做）
  json.dsh = json.dsh || {};
  json.dsh.profile = json.dsh.profile || {};
  json.dsh.profile.bundles = json.dsh.profile.bundles || [];
  if (!json.dsh.profile.bundles.includes(PKG)) {
    json.dsh.profile.bundles.push(PKG);
    say(`  添加 dsh.profile.bundles: ${PKG}`);
  } else {
    say(`  dsh.profile.bundles 已有 ${PKG}`);
  }

  if (dryRun) {
    say(c.dim('\n--dry-run：只打印，不写文件。将要写入的内容：'));
    say(JSON.stringify({ dependencies: json.dependencies, dsh: { profile: { bundles: json.dsh.profile.bundles } } }, null, 2));
    return 0;
  }

  // 备份后写入
  fs.copyFileSync(file, file + '.bak-jizura');
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  say(c.dim(`  已写 ${file}（备份 ${path.basename(file)}.bak-jizura）`));

  // 3) pnpm install
  const pnpm = findPnpm();
  if (!pnpm) die('找不到 pnpm。装一个（npm i -g pnpm）或先启动一次 DSH 让它生成内置 pnpm。');
  say(c.dim(`\n  ${pnpm.cmd === 'pnpm' ? 'pnpm' : '内置 pnpm'} install …`));
  const r = spawnSync(pnpm.cmd, [...pnpm.args, 'install'], { cwd: dir, stdio: 'inherit' });
  if (r.status !== 0) die('pnpm install 失败，见上面的输出。可手动重跑：cd ' + dir + ' && pnpm install');

  const chrome = checkChrome();
  const ffmpeg = checkFfmpeg();
  say('');
  say(c.ok('✓ 安装完成'));
  if (!chrome) say(c.bad('  ⚠ 没找到 Chrome，渲染会失败。装 Chrome 或设 CHROME_PATH。'));
  if (!ffmpeg) say(c.bad('  ⚠ 没找到 ffmpeg，编码会失败。brew install ffmpeg 或设 FFMPEG_PATH。'));
  say(c.b('\n下一步：重启 DSH。'));
  say(c.dim('  插件在启动时加载，不重启工具不会出现。重启后调用 jizura_health 验证。'));
  return 0;
}

function uninstall() {
  const { name, dir } = pickProfile();
  const { file, json } = readProfile(dir);
  say(c.b('卸载 dsh-jizura') + c.dim(`  ← profile: ${name}`));
  if (json.dependencies) delete json.dependencies[PKG];
  if (json.dsh?.profile?.bundles) json.dsh.profile.bundles = json.dsh.profile.bundles.filter(b => b !== PKG);
  if (dryRun) { say(c.dim(JSON.stringify({ dependencies: json.dependencies, bundles: json.dsh?.profile?.bundles }, null, 2))); return 0; }
  fs.copyFileSync(file, file + '.bak-jizura');
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  const pnpm = findPnpm();
  if (pnpm) spawnSync(pnpm.cmd, [...pnpm.args, 'remove', PKG], { cwd: dir, stdio: 'inherit' });
  say(c.dim('  已从 dependencies 与 bundles 移除'));
  say(c.b('\n重启 DSH 生效。'));
  return 0;
}

const HELP = `
dsh-jizura 安装器

  install     装进 DSH（写 dependencies + dsh.profile.bundles，然后 pnpm install）
  doctor      体检：profile、pnpm、Chrome、ffmpeg、依赖与 bundles 状态（不改任何东西）
  uninstall   卸载

选项
  --profile <name>   指定 profile（默认 desktop，其次 web）
  --link <path>      用本地目录安装（开发用）
  --spec <spec>      自定义包来源，默认 ${DEFAULT_SPEC}
  --dry-run          只打印将要做的改动
  -h, --help

例
  npx github:sunleo994946-source/DSH_JIZURA install
  npx github:sunleo994946-source/DSH_JIZURA doctor
`;

if (cmd === 'install' || cmd === 'add') process.exit(install());
else if (cmd === 'uninstall' || cmd === 'remove') process.exit(uninstall());
else if (cmd === 'doctor' || cmd === 'check') process.exit(doctor());
else if (cmd === '-h' || cmd === '--help' || cmd === 'help') { say(HELP); process.exit(0); }
else { say(HELP); process.exit(1); }
