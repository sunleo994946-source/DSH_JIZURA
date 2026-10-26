/* JIZURA headless driver — exposed as window.JZ, called over CDP.
 *
 * The page is dumb: it holds one prepared project/plan and renders frames on demand.
 * All orchestration (sampling times, encoding, naming) lives in Node.
 *
 *   JZ.prepare(project)        -> { duration, width, height, cuts[], fonts }
 *   JZ.frames(times, opt)      -> { frames: [dataURL...], ms: number }
 *   JZ.cutAt(t)                -> cut index
 *   JZ.registry(group)         -> [{ key, name, tags, set }]   (sanity check against parts.json)
 */
(() => {
  'use strict';
  if (typeof J === 'undefined') throw new Error('JIZURA engine not loaded (engine.js missing?)');

  const S = { project: null, plan: null, renderer: null, canvas: null, ctx: null, scale: 1 };

  /* 引擎的版面/时序由 seed 决定，但 09_render.js 里的颗粒、纸张、划痕用 Math.random —— 那是真随机，
     跨进程渲同一帧会有噪声差异。这里在 prepare 时把 Math.random 换成按 seed 播种的 PRNG：
     同一次渲染顺序 → 同一串随机数 → 整片两次渲染逐字节一致。
     （只播种一次，不逐帧重播 —— 颗粒本身该随时间变化，作者原意如此。） */
  const nativeRandom = Math.random;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const FONT_PROBE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:/.・【】（）No.—─';
  const FONT_FAMILIES = ['Dela Gothic One', 'Noto Sans JP', 'Noto Serif JP', 'Zen Kaku Gothic New',
    'Zen Old Mincho', 'Kaisei Tokumin', 'M PLUS Rounded 1c', 'Mochiy Pop One', 'DotGothic16',
    'Yuji Syuku', 'IBM Plex Mono', 'IBM Plex Sans JP'];

  function canvasFor(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* 字体是否真的到位：没到位时画面会静默回退系统字体，插件必须把这件事报出来 */
  async function fontReport() {
    const out = { ok: [], missing: [] };
    for (const fam of FONT_FAMILIES) {
      let ok = false;
      try {
        await document.fonts.load('900 64px "' + fam + '"', 'あA');
        ok = document.fonts.check('900 64px "' + fam + '"');
      } catch (e) { ok = false; }
      (ok ? out.ok : out.missing).push(fam);
    }
    return out;
  }

  function cutInfo(c, i) {
    return {
      index: i, text: c.text, start: +c.start.toFixed(3), end: +c.end.toFixed(3),
      layout: c.layout, enter: c.enter, hold: c.hold, exit: c.exit,
      decor: (c.decor || []).map(d => d.id), treat: c.treat, bg: c.bg, cam: c.cam, fx: c.fx,
      scheme: c.scheme, line: c.line,
    };
  }

  window.JZ = {
    async prepare(project) {
      const base = J.defaultProject();
      const p = Object.assign(base, project || {});
      if (project && project.fx) p.fx = Object.assign(J.defaultProject().fx, project.fx);
      if (project && project.timing) p.timing = Object.assign(J.defaultProject().timing, project.timing);
      if (project && project.enabled) p.enabled = Object.assign(J.defaultProject().enabled, project.enabled);
      // theme = おまかせ (only randomize reads themeId), so run it here with a seeded RNG and fold the result in.
      // p.theme is removed afterwards: the saved project is then self-contained and re-renders identically.
      let omakase = null;
      if (p.theme) {
        if (!J.THEMES[p.theme]) throw new Error('未知 theme: ' + p.theme + '（可用：' + Object.keys(J.THEMES).join(' / ') + '）');
        const rnd = J.rng((p.seed >>> 0) || 1);
        const patch = J.omakase(p, rnd, p.theme);
        Object.assign(p, patch);
        omakase = { theme: p.theme, style: p.style, mood: p.mood, seed: p.seed };
        delete p.theme;
      }
      Math.random = mulberry32(((p.seed >>> 0) || 1) ^ 0x9E3779B9);
      S.project = p;
      S.seed = p.seed;
      S.seeded = true;
      S.plan = J.plan(p, null);
      const text = [p.lyrics, p.title, p.artist, FONT_PROBE].filter(Boolean).join(' ');
      await J.ensureFonts(text, null);
      // Google Fonts 偶尔会漏掉几个字体族。缺了就是静默回退系统字体、画面变味，
      // 所以重试两次再放弃，并把最终状态报上去。
      let fonts = await fontReport();
      for (let attempt = 0; attempt < 2 && fonts.missing.length; attempt++) {
        await new Promise(res => setTimeout(res, 1500));
        await J.ensureFonts(text, null);
        fonts = await fontReport();
      }
      S.renderer = new J.Renderer();
      S.scale = 1;
      S.canvas = canvasFor(S.plan.W, S.plan.H);
      S.ctx = S.canvas.getContext('2d', { alpha: true });
      return {
        duration: +S.plan.duration.toFixed(3),
        width: S.plan.W, height: S.plan.H, W: S.plan.W, H: S.plan.H,
        aspect: p.aspect, fps: p.fps, style: p.style, seed: p.seed, lang: p.lang,
        cuts: S.plan.cuts.map((c, i) => cutInfo(c, i)),
        fonts,
        project: p,                       // 合并后的完整项目：Node 侧原样落盘，保证可复现
        omakase,
      };
    },

    /* times: 秒数组；opt: { scale, transparent, layer: 'back'|'front', format: 'jpeg'|'png', quality } */
    frames(times, opt) {
      if (!S.renderer) throw new Error('call JZ.prepare() first');
      opt = opt || {};
      const scale = opt.scale || 1;
      const format = opt.format || (opt.transparent ? 'png' : 'jpeg');
      const quality = typeof opt.quality === 'number' ? opt.quality : 0.94;
      if (scale !== S.scale) {
        S.scale = scale;
        S.canvas = canvasFor(S.plan.W * scale, S.plan.H * scale);
        S.ctx = S.canvas.getContext('2d', { alpha: true });
      }
      const ctx = S.ctx;
      const ropt = { scale, transparent: !!opt.transparent };
      if (opt.layer) ropt.layer = opt.layer;
      const out = [];
      const t0 = performance.now();
      for (const t of times) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, S.canvas.width, S.canvas.height);
        S.renderer.frame(ctx, S.plan, t, ropt);
        out.push(format === 'png'
          ? S.canvas.toDataURL('image/png')
          : S.canvas.toDataURL('image/jpeg', quality));
      }
      return { frames: out, ms: Math.round(performance.now() - t0) };
    },

    cutAt(t) {
      if (!S.plan) return -1;
      const cs = S.plan.cuts;
      let lo = 0, hi = cs.length - 1, ans = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (cs[m].start <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
      return ans;
    },

    registry(group) {
      return J.order(group).map(k => {
        const d = J.registry(group)[k];
        return { key: k, name: d.name, tags: d.tags || null, set: d.set || null, extra: !!d.extra };
      });
    },

    info() {
      return { prepared: !!S.plan, duration: S.plan ? S.plan.duration : 0, counts: window.JZ && J ? Object.fromEntries(J.GROUP_KEYS.map(g => [g, J.order(g).length])) : null };
    },
  };
})();
