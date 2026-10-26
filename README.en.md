# dsh-jizura

A DSH plugin for Japanese-style lyric motion (文字PV): lyrics or subtitles in, video out.

[中文](README.md)

![Demo](docs/demo.gif)

Demo rendered from 《神のまにまに - 初音ミク》: an LRC file and a style name, `style: magenta`, `seed: 20261026`, no engine changes.
Full segments (720p, with audio): [intro](docs/clips/01-intro.mp4) · [verse](docs/clips/02-verse.mp4) · [chorus](docs/clips/03-chorus.mp4)

## Why this exists

Upstream is used as a full interface workflow: open the browser, load lyrics, try styles one by one, align timings, export — every step done by hand. It also ships After Effects panels that must be installed and learned separately.

This plugin keeps the engine and removes that operating chain. The caller is an agent; the input is lyrics or subtitles plus one sentence of intent. Choosing the look, splitting cuts, previewing and rendering are done by the tools. The engine is not rewritten, so parts, styles and results match upstream.

## What this is

[852wa/JIZURA](https://github.com/852wa/JIZURA) (MIT) is a browser-based lyric animation engine: 860 parts and 27 style packs, arranging lyrics into animated cuts from a seed.

This plugin runs that engine in headless Chrome and exposes it as DSH tools called by the agent. The part catalogue, lyric syntax and rendering rules are defined by the upstream repository.

| Tool | Does |
|---|---|
| `jizura_parts` | List available styles, layouts, decorations |
| `jizura_plan` | Lyrics or subtitles → cut plan + contact sheet + `project.json` |
| `jizura_render` | Produce an MP4, or transparent front/back layers |
| `jizura_health` | Check Chrome, ffmpeg, engine version |

## Install

**Requires**: DSH · Node ≥ 22 · Chrome or Chromium · ffmpeg

```bash
cd ~/.dsh/profiles/desktop
pnpm add github:sunleo994946-source/DSH_JIZURA
```

Add one entry to `dsh.profile.bundles` in `~/.dsh/profiles/desktop/package.json`:

```json
"bundles": ["...", "dsh-jizura"]
```

Then restart DSH. Plugins load at startup; without a restart the tools will not appear. Call `jizura_health` to confirm Chrome and ffmpeg are available.

> If the tools are missing, check in order: the `bundles` entry, the restart, and whether `node_modules/dsh-jizura` exists.

## Usage

Three tools, in order:

| Step | Tool | Output |
|---|---|---|
| 1 | `jizura_parts` | List of available styles, layouts, decorations |
| 2 | `jizura_plan` | Cut plan + contact sheet (one frame per cut) + `project.json` |
| 3 | `jizura_render` | MP4, or transparent front/back layers |

The contact sheet from step 2 is for confirming the look before burning a full render:

![Contact sheet](docs/contact-sheet.jpg)

`jizura_render` accepts `from` / `to` to render a single segment, so previews don't require the whole song.

Or skip DSH and drive it from a terminal: `node tools/render.mjs --help`.

Three output forms:

- **Standalone MP4** — finished video, optional audio mux
- **Black-keyed footage** — `keyBg: "black"`, composited over a HyperFrames stage with `mix-blend-mode: screen`
- **Transparent layers** — `png_back/` and `png_front/`, with your own material between them

## Prompt template

Replace the `{…}` placeholders. The first two lines are required; the rest fall back to defaults.

```
Make a lyric motion video with jizura.

Lyrics or subtitles: {paste lyrics, or give a .lrc / .srt path}
Language: {ja / zh-Hans / zh-Hant / ko / en}
Frame: {9:16 portrait / 16:9}, {1080}p, {30}fps
Look: {one line, e.g. "Japanese, paper texture", "cyber neon", "print, black and white"}
Delivery: {standalone MP4 / goes into my HyperFrames project at <path>}
Music: {assets/song.mp3 — delete this line if none}
Other: {no horror; keep project.json so I can re-render}

Render the contact sheet first; the full song after I confirm.
```

Subtitles accept `.srt` / `.lrc` / `.vtt`, with cue timings used as each line's start time; a `.txt` is treated as lyrics without timing. Bilingual lyrics (original and translation sharing timestamps) are reduced to one line per timestamp according to `Language`.

The plugin performs no audio beat analysis, so subtitle timings are the practical way to align lyrics with music.

## License

Plugin: MIT, see [LICENSE](LICENSE). Engine from [852wa/JIZURA](https://github.com/852wa/JIZURA); attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
