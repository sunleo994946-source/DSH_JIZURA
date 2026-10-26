# dsh-jizura

**Japanese-style lyric motion (文字PV) for DSH: lyrics in, finished video out.**

[中文](README.md) · [Upstream engine: JIZURA](https://github.com/852wa/JIZURA)

JIZURA is a browser-based lyric-motion engine. It holds 860 ready-made parts — layouts, entrances, holds, exits, decorations, text treatments, backgrounds, cameras, effects, transitions — and combines them deterministically from a seed into timed "cuts". This plugin runs that engine unchanged in headless Chrome, wraps it as DSH tools, and wires it specifically for **HyperFrames compositing**: either render the whole video, or render **transparent front/back layers** and let HyperFrames supply the music, subtitles and stage.

![Contact sheet](docs/contact-sheet.jpg)

*What `jizura_plan` gives you: one frame per cut. Look at this before rendering the whole song.*

![Layer compositing](docs/composite-proof.jpg)

*Transparent layer compositing: a HyperFrames stage + `png_back` + `png_front`.*

## What you get

| Tool | Does | Needs a browser |
|---|---|---|
| `jizura_parts` | Browse 860 parts / 27 style packs / 8 moods (by group, keyword, part set) | No |
| `jizura_plan` | Lyrics → cut plan + contact sheet + `project.json` | Yes |
| `jizura_render` | Plan → MP4 / transparent PNG sequences + `layers.json` / ProRes 4444 | Yes |
| `jizura_health` | Self-check: Chrome, ffmpeg, engine version, skill files | No |

Plus the skill **`jizura-hyperframes`**: how to pick a look, read a contact sheet, iterate on seeds, and hand assets to HyperFrames (`skills/jizura-hyperframes/references/handoff.md` has a seek-safe per-frame canvas player and three compositing recipes).

## Requirements

| Need | Notes |
|---|---|
| DSH | Any recent version (uses `ctx.tools` + `ctx.get('skills')`) |
| Node ≥ 22.4 | Uses the built-in global `WebSocket`. **Zero npm dependencies.** |
| Chrome / Chromium / Edge | Auto-detected; otherwise set `CHROME_PATH` |
| ffmpeg | Needs `libx264` / `aac` / `prores_ks`; otherwise set `FFMPEG_PATH` |
| Network | Fonts come from Google Fonts at render time (offline falls back to system faces, and `jizura_plan` says so explicitly) |

macOS: `brew install ffmpeg`.

## Install

### A. From GitHub (recommended)

```bash
cd ~/.dsh/profiles/desktop
pnpm add github:sunleo994946-source/DSH_JIZURA
```

### B. Local development (edits take effect immediately)

```bash
cd ~/.dsh/profiles/desktop
pnpm add dsh-jizura@link:/absolute/path/to/DSH_JIZURA
```

> `link:` symlinks the source directory. Edit `lib/`, restart DSH — no reinstall.

### Then: add the plugin to your profile's bundles

Edit `~/.dsh/profiles/desktop/package.json` and add an entry to `dsh.profile.bundles`:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-drawai",
        "dsh-hyperframes",
        "dsh-jizura"
      ]
    }
  }
}
```

`cordis.patch.yml` is applied automatically by the loader (same mechanism as `dsh-hyperframes`); you don't need to touch the profile's patch file.

### Restart DSH

**Plugins load at startup.** Without a restart the tools and the skill won't appear.

### Verify

Ask the agent to call `jizura_health`. A healthy install looks like:

```
dsh-jizura self-check
  engine    JIZURA 0.10.1 (fc16bfe)  860 parts / 27 styles
  Chrome    OK /Applications/Google Chrome.app/...
  ffmpeg    OK 9.0.2
  skill     OK .../skills/jizura-hyperframes/SKILL.md
  browser   not running (starts on first render)
```

### Uninstall

```bash
cd ~/.dsh/profiles/desktop
pnpm remove dsh-jizura
# also remove "dsh-jizura" from dsh.profile.bundles, then restart DSH
```

---

## Usage

A full job goes like this — the agent walks these steps, you only supply input:

```
jizura_parts   see which looks exist
      ↓
jizura_plan    lyrics → plan + contact sheet   ← review and approve here
      ↓
jizura_render  MP4, or transparent layers for HyperFrames
```

**Step 2 is the important one.** `jizura_plan` renders a contact sheet with one frame per cut. Look at it, adjust the seed or the style, and only then render the full song. Don't skip straight to rendering.

### Three delivery shapes

| You want | Use | Notes |
|---|---|---|
| A standalone video | `jizura_render mode:"video"` | One H.264 MP4, optional audio mux |
| Inside HyperFrames, floating over its stage | `mode:"video"` + `keyBg:"black"` | Black render + CSS `mix-blend-mode: screen`. One MP4 instead of thousands of PNGs. |
| Inside HyperFrames, framing a subject | `mode:"layers"` | `png_back/` + `png_front/` + `layers.json`; the gap is yours |

When unsure, `mode:"both"` produces everything.

---

## What to give the agent

This is where projects succeed or fail. **Only the first two are mandatory**; the more specific the rest, the less rework.

### Mandatory

| Item | Example | Why |
|---|---|---|
| **Lyrics** | one line per lyric line, verbatim | The engine cuts on lines |
| **Lyric language** | `ja` / `zh-Hans` / `zh-Hant` / `ko` / `en` | Decides which face each font role is drawn with. **Non-Japanese must be stated** — a wrong guess mixes fonts inside one line |

### Strongly recommended

| Item | Example |
|---|---|
| **Aspect ratio** | `16:9` (YouTube), `9:16` (TikTok / Reels), `1:1`, `4:5`, `21:9` |
| **Resolution / frame rate** | `1080` / `30`; `60` for fast tracks |
| **Delivery shape** | "standalone video" or "goes into my existing HyperFrames project" |
| **Look** | Plain description is enough: "Japanese, paper texture", "cyber, neon", "print, black and white", "cute, candy colours". The agent maps it to `style` / `theme` |
| **Things to avoid** | "no horror", "no vertical type", "no decorations other than kanji" |

### Optional, but they help

| Item | Notes |
|---|---|
| **Audio file path** | Muxed in `mode:"video"`. ⚠️ This plugin does **no beat analysis** — cuts are timed from lyric length. For beat sync, cut on the HyperFrames side. |
| **Theme** | `lyricpv` typographic / `kinetic` / `wa` Japanese / `pop` / `ballad` / `horror` (off by default) |
| **HyperFrames project path** | If embedding, give the directory so the agent knows where assets go and how to align frames |
| **Structural requests** | "no lyrics for the first 4s, background only", "leave the middle empty for a talking-head in section 2" |
| **Reproducibility** | If you want to re-render the same version later, ask the agent to keep `project.json` and its `seed` |

### A prompt you can copy

```
Make a lyric motion video for this song with jizura.

Lyrics (Japanese):
夜明けの色を/覚えてる
ほどけた声が遠くで鳴った
*透明*なままじゃ終われない!

Language ja, portrait 9:16, 1080p, 30fps.
Look: Japanese, paper texture — not cyber.
Show me the contact sheet first; I'll approve before you render.
Final deliverable is a standalone MP4. Music is assets/song.mp3.
Keep project.json so I can re-render later.
```

### What you don't need to do

- **Don't look up part keys** (`tySquare`, `chochin`…). Describe the effect in plain words; the agent queries `jizura_parts`.
- **Don't pick a seed.** The agent picks one and records it in `project.json`.
- **Don't start a browser.** The plugin launches headless Chrome on first render and closes it after 5 minutes idle.

---

## Tool reference

### `jizura_parts`

```
group?:  layout|enter|hold|exit|decor|treat|bg|cam|fx|trans|style|mood
query?:  keyword across key / Japanese name / English name / tags
set?:    base|extra|typo|kinetic|horror|wa
limit?:  default 60, max 300
```

No browser, instant.

### `jizura_plan`

```
lyrics*        lyrics, one line per line
out?           output directory, default jizura-out/<first line>
aspect?        see table above, default 16:9
resolution?    720|1080|1440|2160, default 1080 (frame height)
fps?           default 24
seed?          same seed = same pictures; the cheapest way to explore variants
style?         style key, e.g. noir paper sumi synth80
theme?         lyricpv|kinetic|wa|horror|pop|ballad (triggers おまかせ randomisation)
lang?          auto|ja|zh-Hant|zh-Hans|ko|en
extra? wa? horror? typo? kinetic?   part-set switches
unify?         repeated lines look the same
typeset?       tighter kana, smaller particles, larger first glyph
centerFree?    keep the centre empty (for a subject / talking head)
keyBg?         off|green|black (compositing background)
overrides?     per line index: { "0": { layout, enter, hold, exit, decor, treat, bg, cam, trans, cuts, single } }
```

Lyric syntax: newline = a line, `/` = manual cut, `*word*` = emphasis, `!` = impact, `[interlude 8]` = 8s instrumental, `[01:23.45]lyric` = LRC time.

`overrides` is keyed by **lyric line index** (0-based, interlude lines included), not by cut index — one line can produce several cuts and they all take that line's settings.

### `jizura_render`

```
projectFile?  the project.json written by jizura_plan (recommended: reproducible)
project?      or an inline project object
out*          output directory
mode?         video|layers|both, default video
fps? scale?   override frame rate / resolution multiplier (0.5 = half-size preview)
audio?        track to mux for mode:video
crf?          x264 quality, default 18, lower is better
alphaFormat?  png (default) | prores
```

`mode:"layers"` produces:

```
out/
├── layers.json              manifest (size, fps, frame count, directories)
├── png_back/f00000.png…     background graphic + decorations behind the lyrics
├── png_front/f00000.png…    lyrics + decorations + ghosts + HUD
└── lyrics_*_prores4444.mov  (with alphaFormat:"prores", alpha preserved)
```

---

## How it works

Not a port — the **original engine running unchanged in headless Chrome**. JIZURA's `12_ui.js` returns immediately when there is no `#app`, so the UI layer and the engine are naturally separable.

```
lib/index.js      tool definitions, serialisation, browser reuse and idle shutdown
lib/render.js     pipeline: project → plan → frames → ffmpeg
lib/cdp.js        dependency-free CDP client + browser lifecycle
engine/engine.js  concatenation of JIZURA src/*.js (2.2MB, built by tools/bundle-engine.mjs)
engine/driver.js  window.JZ: prepare / frames / cutAt
engine/parts.json part catalogue (Japanese + English names)
```

Two deliberate choices:

- **ffmpeg does the encoding**, not browser WebCodecs — the latter has unreliable encoder availability in headless Chrome.
- **Texture is deterministic too**: the engine's grain and paper generators call `Math.random`, so the driver swaps in a seed-seeded PRNG at `prepare()`. The same `project.json` therefore renders byte-identical twice.

## Updating the engine

After upstream JIZURA changes:

```bash
node tools/bundle-engine.mjs --repo /path/to/JIZURA
node test/check.mjs
```

## Tests

```bash
node test/check.mjs    # static: package shape, tool schemas, SKILL.md syntax, part catalogue (seconds)
node test/smoke.mjs    # end to end: lyrics → contact sheet → MP4 + layers + ProRes + reproducibility (~1 min)
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `jizura_plan` reports "N fonts missing" | Can't reach Google Fonts. This is a hard warning: rendering anyway silently falls back to system faces and won't look like the style pack intends |
| `cannot find Chrome / Chromium` | Install Chrome, or `export CHROME_PATH=/path/to/chrome` |
| ffmpeg errors | Check `ffmpeg -version`; macOS: `brew install ffmpeg` |
| Rendering feels slow | 1080p is roughly realtime. Preview long songs with `scale:0.5`, then render full size |
| Tools missing after restart | Check `dsh.profile.bundles` contains `dsh-jizura`, and that `node_modules/dsh-jizura` exists |

## Known limits

- Fonts need the network; offline renders drift (reported, not auto-fixed).
- **No audio beat analysis**: cuts are timed from lyric length. Pin cut counts per line with `overrides`, or cut on the HyperFrames side.
- VP9-alpha WebM is deliberately not offered — some ffmpeg builds drop its alpha silently and you get a solid rectangle. Use the PNG sequence or ProRes 4444.
- Render a pass in one call: rendering subsets of frames across calls can differ in grain.

## License

Plugin: MIT, see [LICENSE](LICENSE).

Engine from [852wa/JIZURA](https://github.com/852wa/JIZURA) (MIT). `engine/engine.js` and `engine/parts.json` are derived from it; copyright remains with the original authors — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
