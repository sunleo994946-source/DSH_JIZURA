#!/usr/bin/env node
/* 静态自检：插件形状、工具 schema、SKILL.md 语法、部件目录完整性。
 * node test/check.mjs      —— 不启动浏览器，秒级
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failed++;
};

console.log('1) 包形状');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
ok(pkg.name === 'dsh-jizura', 'package name', pkg.name);
ok(pkg.type === 'module', 'type: module');
ok(fs.existsSync(path.join(root, pkg.main)), 'main 存在', pkg.main);
ok(pkg.dsh?.bundle?.patch, 'dsh.bundle.patch 已声明');
ok(fs.existsSync(path.join(root, 'cordis.patch.yml')), 'cordis.patch.yml 存在');
for (const f of ['lib/index.js', 'lib/render.js', 'lib/cdp.js', 'engine/engine.js', 'engine/driver.js',
  'engine/driver.html', 'engine/parts.json', 'engine/version.json']) {
  ok(fs.existsSync(path.join(root, f)), '文件', f);
}

console.log('\n2) 引擎与部件目录');
const parts = JSON.parse(fs.readFileSync(path.join(root, 'engine/parts.json'), 'utf8'));
const total = Object.values(parts.counts).reduce((a, b) => a + b, 0);
ok(total === 860, '部件总数 860', String(total));
ok(parts.styles.length === 27, '样式 27', String(parts.styles.length));
ok(Object.keys(parts.counts).length === 10, '十个组');
ok(parts.parts.every(p => p.key && p.name), '每个部件都有 key 和名字');
ok(parts.parts.filter(p => p.nameEn).length === parts.parts.length, '每个部件都有英文名');
const engineSize = fs.statSync(path.join(root, 'engine/engine.js')).size;
ok(engineSize > 2e6, '引擎已打包', (engineSize / 1048576).toFixed(2) + ' MB');

console.log('\n3) 插件导出与工具');
const mod = await import(path.join(root, 'lib/index.js'));
ok(mod.name === 'dsh-jizura', '导出 name', mod.name);
ok(Array.isArray(mod.inject) && mod.inject.includes('tools'), 'inject 含 tools', JSON.stringify(mod.inject));
ok(typeof mod.apply === 'function', '导出 apply');

const registered = new Map();
const skills = [];
const disposers = [];
const ctx = {
  tools: { register(tool) { registered.set(tool.name, tool); return () => registered.delete(tool.name); } },
  get: key => (key === 'skills' ? { register(def) { skills.push(def); return () => {}; } } : undefined),
  effect(fn) { const d = fn(); if (typeof d === 'function') disposers.push(d); return d; },
  logger: { info() {}, warn(m) { console.log('     [warn]', m); } },
};
mod.apply(ctx);
ok(registered.size === 4, '注册 4 个工具', [...registered.keys()].join(', '));
for (const [name, tool] of registered) {
  ok(typeof tool.description === 'string' && tool.description.length > 30, `${name} 有 description`);
  ok(typeof tool.execute === 'function', `${name} 有 execute`);
  const schema = tool.parameters || {};
  ok(schema.type === 'object' && schema.properties, `${name} parameters 是 JSON Schema`);
}

console.log('\n4) 技能文件');
ok(skills.length === 1, '注册 1 个技能', skills.map(s => s.name).join(','));
const skill = skills[0];
if (skill) {
  ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skill.name), 'name 是 kebab-case', skill.name);
  ok(skill.name === path.basename(skill.resourceBase?.path || ''), 'name 与目录名一致');
  ok(typeof skill.description === 'string' && skill.description.length > 60, 'description 足够描述触发场景', skill.description.length + ' 字符');
  ok(typeof skill.content === 'string' && skill.content.length > 800, '正文有实质内容', skill.content.length + ' 字符');
  ok(skill.source === 'runtime', "source: 'runtime'");
  ok(fs.existsSync(path.join(root, 'skills/jizura-hyperframes/references/handoff.md')), 'references/handoff.md 存在');
  ok(fs.existsSync(path.join(root, 'skills/jizura-hyperframes/references/parts.md')), 'references/parts.md 存在');
}

console.log('\n5) 工具离线行为（jizura_parts / jizura_health）');
const partsOut = await registered.get('jizura_parts').execute({});
ok(partsOut.includes('860') || partsOut.includes('layout 184'), '无参调用给出组计数');
const layoutOut = await registered.get('jizura_parts').execute({ group: 'layout', query: 'vertical', limit: 5 });
ok(/vcols|Vertical/.test(layoutOut), '按关键词查得到竖排版面');
const styleOut = await registered.get('jizura_parts').execute({ group: 'style', limit: 3 });
ok(/noir|Noir/.test(styleOut), '样式可查');
const moodOut = await registered.get('jizura_parts').execute({ group: 'mood' });
ok(/horror/.test(moodOut), '情绪可查');
const healthOut = await registered.get('jizura_health').execute({});
ok(/Chrome/.test(healthOut) && /ffmpeg/.test(healthOut), '自检报告 Chrome 与 ffmpeg');

console.log(`\n${failed === 0 ? '全部通过 ✅' : failed + ' 项失败 ❌'}`);
process.exit(failed === 0 ? 0 : 1);
