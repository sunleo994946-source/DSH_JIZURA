# dsh-jizura

Japanese-style lyric motion (文字PV) for DSH: **lyrics in, finished video out**.

[中文](README.md)

**Why this exists** — upstream is a full browser GUI tool with its own After Effects panels. It is powerful, but getting it deployed and operated costs about as much as setting up After Effects. This plugin removes all of that: no UI to drive, no panel to install, no timeline to poke at — just ask DSH and get video.

> The engine is [852wa/JIZURA](https://github.com/852wa/JIZURA) (MIT) — all 860 parts, 27 style packs, lyric syntax and rendering details live in that repository.
> **This repository is only the DSH plugin wrapper**: the engine as tools, plus a HyperFrames handoff skill.

![Contact sheet](docs/contact-sheet.jpg)

**What you get**

| Tool | Does |
|---|---|
| `jizura_parts` | Browse available styles / layouts / decorations |
| `jizura_plan` | Lyrics → cut plan + contact sheet (one frame per cut — look before rendering) |
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

## Usage

The agent walks this order for you:

```
jizura_parts → jizura_plan (review the contact sheet) → jizura_render
```

Step two is the important one: `jizura_plan` renders one frame per cut. Look at it, adjust the look, then render the full song.

Three delivery shapes: standalone MP4 / black-keyed footage over a HyperFrames stage / transparent front+back layers framing your own material.

## What to give the agent

**Mandatory**

- **Lyrics**: one line per lyric line
- **Language**: `ja` / `zh-Hans` / `zh-Hant` / `ko` / `en` (state it for non-Japanese — otherwise fonts get mixed inside a line)

**Recommended**: aspect ratio (`16:9` / `9:16`…), delivery shape, a description of the look ("Japanese, paper texture" is enough), anything to avoid.

**Optional**: audio file path, theme (`lyricpv`/`kinetic`/`wa`/`pop`/`ballad`), HyperFrames project path.

A prompt you can copy:

```
Make a lyric motion video for this song with jizura.
Lyrics (Japanese):
夜明けの色を/覚えてる
ほどけた声が遠くで鳴った
Language ja, portrait 9:16, 1080p, 30fps, Japanese paper look.
Show me the contact sheet first, then render. Standalone MP4, music is assets/song.mp3.
Keep project.json so I can re-render.
```

> You don't need to look up part keys, pick a seed, or start a browser yourself.

## License

Plugin: MIT, see [LICENSE](LICENSE). Engine from [852wa/JIZURA](https://github.com/852wa/JIZURA); attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
