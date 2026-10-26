# Handing JIZURA layers to HyperFrames

Three ways to get JIZURA's typography into a HyperFrames composition, cheapest first. Pick by whether the stage behind the lyrics is *flat* or *real content*.

| Recipe | Assets | When |
|---|---|---|
| **1. Opaque MP4** | `jizura_render mode:"video"` | The JIZURA background is the stage. Just place the video full-frame. |
| **2. Keyed MP4** | `mode:"video"` + `project.keyBg:"black"` (or `"green"`) | Lyrics float over *your* background. Black + `mix-blend-mode: screen` needs no keying at all. |
| **3. PNG layer sequences** | `mode:"layers"` | Full control: back behind a subject, front over it, per-frame compositing, alpha edges that must survive. |

Recipe 2 is what the JIZURA author designed for AE compositing: `keyBg:"black"` renders white type and effects on pure black, so `screen` blend drops the black. Try it before reaching for recipe 3 — it is one MP4 instead of thousands of PNGs.

## Asset layout

`jizura_render mode:"layers"` writes:

```
assets/lyrics/
├── layers.json          # the contract — read this, don't enumerate directories
├── png_back/            # background graphic + decorations behind the lyrics
│   ├── f00000.png       # RGBA, frame numbers are zero-padded to 5
│   └── …
└── png_front/           # lyrics, their decorations, ghosts, HUD
    ├── f00000.png
    └── …
```

`layers.json`:

```json
{
  "kind": "jizura-alpha-layers",
  "jizura": "0.10.1",
  "width": 1920, "height": 1080,
  "fps": 30, "frames": 285, "duration": 9.5,
  "sequences": { "back": "…/png_back", "front": "…/png_front" },
  "prores": null
}
```

## Canvas player (frame-exact, seek-safe)

HyperFrames renders by seeking, not by playing — so never rely on `requestAnimationFrame` accumulating. Drive the player from the composition's clock:

```html
<canvas id="jz" width="1920" height="1080" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
<script>
window.jzPlayer = {
  manifest: null, back: [], front: [], ready: false,
  async load(baseUrl) {
    this.manifest = await (await fetch(baseUrl + '/layers.json')).json();
    const m = this.manifest;
    this.back  = await Promise.all(Array.from({length: m.frames}, (_, i) =>
      loadImage(`${baseUrl}/png_back/f${String(i).padStart(5, '0')}.png`)));
    this.front = await Promise.all(Array.from({length: m.frames}, (_, i) =>
      loadImage(`${baseUrl}/png_front/f${String(i).padStart(5, '0')}.png`)));
    this.ready = true;
  },
  /* t = seconds since the sequence starts; returns nothing, draws synchronously */
  drawAt(t) {
    if (!this.ready) return;
    const m = this.manifest;
    const i = Math.max(0, Math.min(m.frames - 1, Math.round(t * m.fps)));
    const ctx = document.getElementById('jz').getContext('2d');
    ctx.clearRect(0, 0, m.width, m.height);
    ctx.drawImage(this.back[i], 0, 0, m.width, m.height);
    ctx.drawImage(this.front[i], 0, 0, m.width, m.height);
  },
};
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
</script>
```

Everything between back and front — your footage, your brand frame, a cut-out subject — goes in the gap between the two `drawImage` calls:

```js
ctx.drawImage(this.back[i], 0, 0, m.width, m.height);
ctx.drawImage(myFootage, 0, 0, m.width, m.height);   // ← the stage
ctx.drawImage(this.front[i], 0, 0, m.width, m.height);
```

If the composition plays only a **section** of the song, subtract the section's offset before calling `drawAt`: `drawAt(t - SECTION_START)`.

## Aligning HF frames with JIZURA cuts

JIZURA's plan gives you each cut's `start`/`end`. Cut HyperFrames frames on those boundaries so no entrance gets sliced.

- If the whole song is one HF scene, one player instance is enough — seek it continuously.
- If you split per lyric line, slice the PNG sequence per line rather than loading the whole thing into every scene: an 1080p 30fps sequence is ~1–3 MB per frame for busy frames; a 3-minute song is **thousands of files**. Render per section with `out` per section instead.
- Keep `layers.json` next to the frames it describes and copy whole folders — never mix frames from two renders.

## Recipe 2 details (keyed MP4)

```html
<video src="assets/lyrics.mp4" class="clip" style="mix-blend-mode: screen"></video>
```

- `screen` on a black-keyed render removes black and keeps white/coloured type. Works for light-on-dark designs, which is most of JIZURA's packs.
- For dark type on light backgrounds use `keyBg:"green"` and a chroma key, or use recipe 3.
- Edge quality: `screen` is crisp; chroma keying on green will show fringing on thin strokes. If it does, switch to the PNG sequence.
- Do not put `screen` over a mid-grey stage and expect contrast — screen brightens. Check a frame.

## Editing-app handoff

`alphaFormat:"prores"` also writes `lyrics_front_prores4444.mov` / `lyrics_back_prores4444.mov` (ProRes 4444, alpha preserved, verified `yuva444p10le`). Drop those into Premiere / Resolve / FCP when the final assembly happens outside HF. Same frame count and fps as the PNG sequences, so the two are interchangeable.

## Do not

- Do not expect a VP9-alpha `.webm`. ffmpeg builds commonly drop its alpha channel without an error; you get a solid black rectangle. PNG or ProRes only.
- Do not resize the canvas to "fit" the aspect: re-render at the target aspect. Layouts re-flow; scaled-down 16:9 in a 9:16 frame looks like a mistake because it is one.
- Do not run `drawAt` inside the HF render loop with a fresh `fetch` per frame — load once, draw many.
