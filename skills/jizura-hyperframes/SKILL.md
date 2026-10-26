---
name: jizura-hyperframes
description: "Generate Japanese-style lyric motion video (文字PV / lyric-motion) with JIZURA and composite it in HyperFrames. Use when lyrics should become animated typography — 歌詞から文字PV, lyric video, kinetic type over music, per-line text animation — or when a HyperFrames video needs transparent lyric layers (front/back PNG sequences, ProRes 4444, green/black key) to sit over its own background. JIZURA supplies 860 ready-made parts (layouts, entrances, holds, exits, decorations, treatments, backgrounds, cameras, effects, transitions) in 27 style packs; HyperFrames supplies the timeline, audio, subtitles and stage."
---

# JIZURA × HyperFrames — lyric motion as a layer, not a black box

JIZURA is a deterministic lyric-motion engine: lyrics in, timed **cuts** out, each cut dressed by a randomly-chosen combination of 860 parts. Same seed → same pictures, every time.

Two ways to use it. Pick deliberately — they are not interchangeable.

| | **A. JIZURA as the whole video** | **B. JIZURA as a layer source inside HyperFrames** ← default |
|---|---|---|
| Use when | The deliverable is just lyrics + music, and the JIZURA look is the point | The video needs its own stage: footage, brand frame, subtitles, several lyric sections, transitions between them |
| Output | `jizura_render` mode `video` → one MP4 | `jizura_render` mode `layers` → transparent front/back sequences, placed in HF compositions |
| You hand-tune | nothing (change seed / style) | timing, which section goes where, everything around the lyrics |

Do not rebuild JIZURA's typography in HTML/GSAP. 860 parts already exist; re-creating three of them by hand is slower and worse. Do not use JIZURA for the parts of the video that are not lyrics — that is HyperFrames' job.

## The three tools

### `jizura_parts` — what exists
No browser, instant. Use it before guessing a part key, and to answer "is there a layout for X?".
```
jizura_parts { group?: layout|enter|hold|exit|decor|treat|bg|cam|fx|trans|style,
               query?: "vertical", set?: base|extra|typo|kinetic|horror, limit?: 40 }
```
Returns `key — 日本語名 / English name [tags] (set)`. The `key` is what you pass in overrides; the names are for talking to the user.

### `jizura_plan` — lyrics → cut plan + contact sheet
Starts headless Chrome, plans the song, renders one still per cut into a grid image. **Look at the contact sheet before rendering anything long.**
```
jizura_plan {
  lyrics: "夜明けの色を/覚えてる\nほどけた声が遠くで鳴った",   // '/' = manual cut, '*' = emphasis, '!' = hit, '[interlude 8]' = instrumental
  out?: "videos/song/jizura",        // default: <cwd>/jizura-out/<slug>
  aspect?: "16:9"|"9:16"|"4:3"|"3:4"|"1:1"|"4:5"|"21:9",
  resolution?: 720|1080|1440|2160,   // frame height
  fps?: 24|30|60,
  seed?: number, style?: "noir"|…, theme?: "lyric"|"kinetic"|"wa"|"horror"|"pop"|"ballad",
  lang?: "auto"|"ja"|"zh-Hant"|"zh-Hans"|"ko"|"en",
  extra?: bool, wa?: bool, horror?: bool, typo?: bool, kinetic?: bool,
  unify?: bool, typeset?: bool, centerFree?: bool, keyBg?: "off"|"green"|"black",
  overrides?: { "<line index>": { layout?, enter?, hold?, exit?, decor?:[..], treat?, bg?, cam?, trans?, cuts?: number, single?: bool } }
}
```
Reads back: duration, size, per-cut table (`start–end  text | layout/enter/hold/exit | decor | bg | cam`), font status, contact sheet path.

`overrides` is keyed by **lyric line index** (0-based, counting every line including interlude lines), not by cut index: one line can produce several cuts and they all take the line's override. `cuts: n` forces that line into exactly n cuts; `single:true` forces one.

**Font warning is a hard stop.** If `fonts.missing` is non-empty the render silently falls back to system faces and will not look like the style pack intends — usually no network to Google Fonts. Say so instead of shipping it.

### `jizura_render` — plan → assets
```
jizura_render {
  projectFile?: "…/project.json",  // from jizura_plan; or pass `project` inline
  project?: { …same fields as jizura_plan… },
  out: "videos/song/assets/lyrics",
  mode: "video" | "layers" | "both",
  fps?, scale?: 0.5|1|2,          // scale multiplies the planned size
  audio?: "path/to/song.mp3",     // muxed into mode:video
  crf?: 18,                       // x264 quality, lower = better
  alphaFormat?: "png" | "prores"  // mode:layers: png sequence (default) and/or ProRes 4444
}
```
- `video` → `*.mp4` (H.264 + AAC). Add `keyBg:"green"|"black"` to the project for chroma-key footage.
- `layers` → `png_front/`, `png_back/`, `layers.json` manifest, plus `lyrics_front_prores4444.mov` when `alphaFormat:"prores"`.
  *back* = background graphic + decorations behind the lyrics. *front* = lyrics, their decorations, ghosts, HUD.
- `both` → everything.

Rendering speed is roughly realtime at 1080p. Long songs: render `layers` once and reuse across compositions.

## Handing layers to HyperFrames

Read `references/handoff.md` before writing the composition — it has the ready-made canvas player, the manifest contract, and the green/black-key CSS recipes. The short version:

1. `jizura_render mode:"layers"` → `layers.json` + frame folders beside it.
2. Copy (or symlink) the asset folder into the HF project's `assets/`.
3. In each composition, draw back → your own stage → front, in that order. The demo player in `references/handoff.md` is frame-exact and seeks deterministically, which HF's renderer requires.
4. Keep the lyrics' **frame budget** aligned: if you cut the song into HF frames, cut on JIZURA's cut boundaries (`start`/`end` from the plan), not on arbitrary times — otherwise a lyric gets sliced mid-entrance.

## Working loop

1. Ask for lyrics (or use a sample) + the aspect ratio and where the video will live. **Ask about the language of the lyrics** if it is not Japanese: the font roles swap per language and wrong detection changes every face.
2. `jizura_parts group:"style"` → offer 2–3 style packs in words, not keys. Offer previews, not a wall of options.
3. `jizura_plan` → **show the contact sheet** (it is one image; it is the whole point of the tool).
4. Iterate on `seed` / `style` / `theme` / per-line `overrides`. One change per round; keep what the user liked.
5. Once the look is approved: `layers` for embedding, `video` for a standalone deliverable.
6. If it goes into HyperFrames, hand off to that skill now (`/hyperframes`, `/music-to-video`) — do not build the timeline here.

## Rules that keep it from looking wrong

- **One cut, one idea.** A cut shorter than ~0.6 s cannot be read; if the plan produces those, the lyrics have too many words per line — suggest splitting with `/`.
- **Don't stack sets.** `horror` + `kinetic` + `extra` all on at once produces noise. Pick a theme; let the theme turn on what it needs.
- **Repeat lines should look the same.** `unify:true` handles this. Turn it off only when the user asks for a different treatment per repeat.
- **Vertical is not a crop.** For 9:16/3:4 re-plan from scratch (`aspect:"9:16"`) — every layout re-flows. Never scale a 16:9 render into a tall frame.
- **`centerFree:true`** when someone will stand in the middle of the frame (talking-head overlay, dance). It keeps the middle empty instead of covering it.
- Never claim a render is done from a frame count — open the contact sheet or an extracted frame and look at it.

## Reproducibility

Same `project.json` → byte-identical frames, including film grain and paper texture (the renderer seeds `Math.random` from the project seed; the engine's own grain generators otherwise use true randomness). Each render pass re-plans from the project, so `mode:"video"`, `mode:"layers"` and `mode:"both"` produce the same imagery — you can render layers now and the video later without them drifting apart. Rendering a *subset* of frames with different tool calls is the one case where grain can differ; always render a pass in one call.

## Known limits
- Fonts load from Google Fonts at render time; offline renders fall back to system faces (reported by `jizura_plan`).
- No audio analysis yet: JIZURA times cuts from lyric length, not from beats. If beat sync matters, set `overrides: { "<line>": { cuts: 1 } }` and place the sections yourself, or compose the beat grid on the HyperFrames side and cut there.
- VP9-alpha WebM is deliberately not offered (ffmpeg builds drop its alpha silently). Use the PNG sequence or ProRes 4444.
