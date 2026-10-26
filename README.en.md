# dsh-jizura

Japanese-style lyric motion (文字PV) for DSH: **lyrics in, finished video out**.

[中文](README.md)

**Why this exists** — upstream is software a person drives by hand: open the browser UI, load lyrics, tune the look part by part, align the timing, export. None of that exists here, because **the one operating it is the agent**. Describe the lyrics and the intent, and it picks the look, renders a contact sheet, re-rolls the seed and renders the video. You used to have to learn the whole interface; now you only have to describe what you want.

> The engine is [852wa/JIZURA](https://github.com/852wa/JIZURA) (MIT) — all 860 parts, 27 style packs, lyric syntax and rendering details live in that repository.
> **This repository is only the DSH plugin wrapper**: the engine as tools, plus a HyperFrames handoff skill.

![Contact sheet](docs/contact-sheet.jpg)

**What you get**

| Tool | Does |
|---|---|
| `jizura_parts` | Browse available styles / layouts / decorations |
| `jizura_plan` | Lyrics or subtitles → cut plan + contact sheet (one frame per cut) |
| `jizura_render` | MP4, or transparent front/back layers for HyperFrames |
| `jizura_health` | Check Chrome / ffmpeg / engine version |

## Install

**Requires**: DSH · Node ≥ 22 · Chrome or Chromium · ffmpeg

```bash
cd ~/.dsh/profiles/desktop
pnpm add github:sunleo994946-source/DSH_JIZURA
```

Then add one entry to `dsh.profile.bundles` in `~/.dsh/profiles/desktop/package.json`:

```json
"bundles": ["...", "dsh-jizura"]
```

**Restart DSH.** Then ask the agent to run `jizura_health` — Chrome and ffmpeg should both show ✅.

> Three reasons it doesn't show up: missing `bundles` entry, no restart, `node_modules/dsh-jizura` missing.

## How to brief the agent

Copy this, replace the `{…}` placeholders with your own words. **Only the first two lines are required**; the rest fall back to defaults:

```
Make a lyric motion video with jizura.

Lyrics or subtitles: {paste lyrics, or give a .lrc / .srt path}
Language: {ja / zh-Hans / zh-Hant / ko / en}
Frame: {9:16 portrait / 16:9}, {1080}p, {30}fps
Look: {one line, e.g. "Japanese, paper texture", "cyber neon", "print, black and white"}
Delivery: {standalone MP4 / goes into my HyperFrames project at <path>}
Music: {assets/song.mp3 — delete this line if none}
Other: {no horror; keep project.json so I can re-render}

Show me the contact sheet first; render the full song after I approve.
```

**About subtitles**: `.srt` / `.lrc` / `.vtt` are all accepted. Cue timings become each line's start time — far more accurate than guessing from character count, and no audio analysis needed. A plain `.txt` works too; that's just lyrics without timing.

**What you actually have to supply**: the lyrics (or subtitle file) and the language. Everything else — picking a look, choosing a seed, splitting cuts, rendering previews — the agent handles, then shows you the contact sheet.

> The agent doesn't need part keys, seeds or browser instructions from you; it has `jizura_parts` and `jizura_plan`.

## Flow

```
jizura_parts → jizura_plan (review the contact sheet) → jizura_render
```

Step two is the important one: one frame per cut in a single image. Adjust the look there, then render the full song.

Three delivery shapes: standalone MP4 / black-keyed footage over a HyperFrames stage / transparent front+back layers framing your own material.

## License

Plugin: MIT, see [LICENSE](LICENSE). Engine from [852wa/JIZURA](https://github.com/852wa/JIZURA); attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
