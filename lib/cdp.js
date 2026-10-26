/* Minimal Chrome DevTools Protocol client — no npm dependencies.
 * Uses the global WebSocket (Node >= 22). Only what the renderer needs:
 * target creation, flat session attach, Runtime.evaluate with returnByValue.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ locate Chrome */

const MAC_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];
const LINUX_CANDIDATES = [
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge', '/snap/bin/chromium',
];
const WIN_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

function playwrightHeadlessShell() {
  const home = os.homedir();
  const roots = [
    path.join(home, 'Library/Caches/ms-playwright'),
    path.join(home, '.cache/ms-playwright'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null,
  ].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      if (!dir.startsWith('chromium_headless_shell')) continue;
      for (const rel of ['chrome-mac/headless_shell', 'chrome-linux/headless_shell', 'chrome-win/headless_shell.exe']) {
        const p = path.join(root, dir, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

export function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const list = process.platform === 'darwin' ? MAC_CANDIDATES
    : process.platform === 'win32' ? WIN_CANDIDATES : LINUX_CANDIDATES;
  for (const p of list) if (fs.existsSync(p)) return p;
  const shell = playwrightHeadlessShell();
  if (shell) return shell;
  return null;
}

/* ------------------------------------------------------------------ connection */

class Connection {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ''); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(timer);
        if (msg.error) reject(new Error(`${msg.error.message}${msg.error.data ? ' — ' + msg.error.data : ''}`));
        else resolve(msg.result);
      } else {
        for (const fn of this.listeners) fn(msg);
      }
    };
    ws.onclose = () => {
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error('CDP 连接已断开')); }
      this.pending.clear();
    };
  }

  send(method, params = {}, sessionId, timeout = 300000) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP 超时: ${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  once(method, sessionId) {
    return new Promise(resolve => {
      const fn = msg => {
        if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) {
          this.listeners.delete(fn);
          resolve(msg.params);
        }
      };
      this.listeners.add(fn);
    });
  }

  close() { try { this.ws.close(); } catch {} }
}

/* ------------------------------------------------------------------ browser */

export class HeadlessBrowser {
  constructor(opts = {}) {
    this.chrome = opts.chrome || findChrome();
    this.userDataDir = opts.userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'jizura-chrome-'));
    this.keepProfile = !!opts.userDataDir;
    this.child = null;
    this.conn = null;
    this.sessionId = null;
    this.pageReady = false;
  }

  async start() {
    if (!this.chrome) {
      throw new Error('找不到 Chrome / Chromium。设 CHROME_PATH 环境变量指向可执行文件即可。');
    }
    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${this.userDataDir}`,
      '--no-first-run', '--no-default-browser-check', '--no-sandbox',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--disable-ipc-flooding-protection',
      '--hide-scrollbars', '--mute-audio', '--disable-extensions',
      '--force-device-scale-factor=1', '--font-render-hinting=none',
      'about:blank',
    ];
    this.child = spawn(this.chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    // 宿主被强杀时也别留下孤儿 chrome
    this._onExit = () => { try { this.child.kill('SIGKILL'); } catch {} };
    process.once('exit', this._onExit);
    let stderr = '';
    this.child.stderr.on('data', d => { stderr += d.toString(); if (stderr.length > 40000) stderr = stderr.slice(-20000); });
    this.child.on('exit', code => { this.exitCode = code; });

    // DevToolsActivePort: 第一行端口，第二行浏览器级 ws 路径
    const portFile = path.join(this.userDataDir, 'DevToolsActivePort');
    let port = null;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (this.exitCode !== undefined && this.exitCode !== null) break;
      if (fs.existsSync(portFile)) {
        const txt = fs.readFileSync(portFile, 'utf8').split('\n');
        if (txt[0]) { port = Number(txt[0].trim()); break; }
      }
      await sleep(120);
    }
    if (!port) {
      throw new Error(`Chrome 没能在 20 秒内启动。${this.exitCode !== undefined ? ' 退出码 ' + this.exitCode : ''}\n${stderr.slice(-800)}`);
    }
    this.port = port;

    // 用 HTTP 拿浏览器级 ws 地址（比拼 DevToolsActivePort 第二行可靠）
    let version = null;
    for (let i = 0; i < 40 && !version; i++) {
      try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(150); }
    }
    if (!version) throw new Error('无法连接 Chrome 的 DevTools 端点');

    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('WebSocket 握手失败'));
    });
    this.conn = new Connection(ws);
    return this;
  }

  /* 打开一个页面（driver.html），等引擎就绪 */
  async open(url, readyExpr = 'window.__JZ_READY === true', timeout = 60000) {
    const { targetId } = await this.conn.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.conn.send('Target.attachToTarget', { targetId, flatten: true });
    this.sessionId = sessionId;
    this.targetId = targetId;
    await this.conn.send('Page.enable', {}, sessionId);
    await this.conn.send('Runtime.enable', {}, sessionId);

    const loaded = this.conn.once('Page.loadEventFired', sessionId);
    await this.conn.send('Page.navigate', { url }, sessionId);
    await Promise.race([loaded, sleep(30000)]);

    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const ok = await this.evaluate(`(${readyExpr})`, { awaitPromise: false }).catch(() => false);
      if (ok) { this.pageReady = true; return this; }
      await sleep(150);
    }
    const diag = await this.evaluate('document.body ? document.body.innerText.slice(0,400) : "(no body)"').catch(() => '');
    throw new Error(`页面引擎未就绪：${url}\n${diag}`);
  }

  async evaluate(expression, { awaitPromise = true, timeout = 300000, returnByValue = true } = {}) {
    if (!this.sessionId) throw new Error('还没有打开的页面');
    const res = await this.conn.send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue, timeout,
    }, this.sessionId, timeout + 5000);
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      const desc = (d.exception && (d.exception.description || d.exception.value)) || d.text;
      const err = new Error(`页面内异常：${String(desc).split('\n').slice(0, 6).join('\n')}`);
      err.details = d;
      throw err;
    }
    return res.result ? res.result.value : undefined;
  }

  async close() {
    if (this._onExit) { process.removeListener('exit', this._onExit); this._onExit = null; }
    try { if (this.conn) this.conn.close(); } catch {}
    try { if (this.child && this.exitCode === undefined) this.child.kill('SIGTERM'); } catch {}
    await sleep(120);
    try { if (this.child && this.exitCode === undefined) this.child.kill('SIGKILL'); } catch {}
    if (!this.keepProfile) {
      try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch {}
    }
  }
}
