# Choosing parts — the short field guide

`jizura_parts` is the source of truth (860 entries, all with `key`, 日本語名, English name, tags, set). This file is the judgement that a listing cannot give you.

## The ten groups and when you touch them

| group | picked per | what it is | reach for it when |
|---|---|---|---|
| `layout` (184) | cut | composition of the line — where the type sits, what else is on screen | the line feels boring / too centred / too dense |
| `enter` (125) | cut | entrance animation | the cut needs more impact at its start |
| `hold` (52) | cut | idle motion while the line is held | long lines that sit still too long |
| `exit` (109) | cut | exit animation | the cut needs to clear with intent |
| `decor` (130) | cut, 0..n | graphic accents (corner marks, halftone, seals, waveforms) | the frame is empty around the type |
| `treat` (62) | cut | text treatment (outline, extrude, neon, karaoke…) | the type itself needs weight or a material |
| `bg` (66) | line | full-screen background graphic | the background is a flat colour and shouldn't be |
| `cam` (36) | cut | camera move over the cut | everything is static; subtle motion is missing |
| `fx` (69) | event | post effects (chroma jump, flash, shake, mosaic) | a hit, a `!`, a beat drop |
| `trans` (27) | cut | cut-to-cut transition | two cuts collide instead of passing |

Overrides are per **lyric line** (`overrides: { "<line>": { layout, enter, … } }`), and every cut of that line takes them. Change one group at a time and look again — changing three at once teaches you nothing about which one worked.

## Style packs (27) — pick by the reference the user gave you

Base twelve: `noir` (black/white, cyan+amber offsets), `crimson` (deep red, damaged data), `caution` (yellow/red/blue instrument graphics), `magenta` (hot pink, round bold), `paper` (paper texture, indigo, serif), `hud` (charcoal, fine frames, orange), `mint` (black/teal/lime, scans), `specimen` (ink background, serif annotations), `transit` (olive/yellow signage), `blueprint` (blue/white collage), `rouge` (light gray, red gradients), `mono` (gray, white serif, RGB separation).

Extra fifteen (need `extra:true`): `sakura` `ocean` `sunset` `forest` `vapor` `newsprint` `synth80` `kraft` `candy` `acid` `sumi` `gold`, plus the three horror packs `hrRuin` `hrNightRec` `hrCurse` (need `horror:true`).

- `sumi` is the one to reach for when the user says "和風", "Japanese", "brush", "washi".
- `synth80` / `vapor` for retro; `newsprint` / `kraft` for print/zine; `acid` for punk; `gold` for luxury/ballad.
- Do not pick `hrRuin` unless horror was asked for — it is eerie by design, not "dark".

## Part sets — the switches, and what they cost

- `base` (356): the original set, always on.
- `extra` (351): everything added later, **off by default**. Turn on for more variety; it also adds 15 styles. Most "日式" motifs live here.
- `wa`: traditional Japanese motifs (ema, chochin, noren, tanzaku, seigaiha, sakura…). On by default; `wa:false` removes them — do that when the user explicitly wants a modern/Western look.
- `typo` (50): 文字PV typographic parts, on by default. Best when the design is type-only.
- `kinetic` (51): motion-first parts, on by default. Best for fast, percussive lines.
- `horror` (52): off by default, and the only set that hijacks the mood. Leave it alone unless asked.

Turning everything on is not "more choice", it is mush. A coherent piece uses a theme (`theme:"kinetic"` / `"wa"` / `"lyric"` / `"pop"` / `"ballad"` / `"horror"`) and lets that theme decide.

## Aspect and language change everything

- `9:16` / `3:4`: layouts re-flow to vertical lanes; `vcols` (縦書き) is native there and awkward in 16:9. `21:9`: very few layouts fill it — prefer `huge`, `marquee`, `splitH`.
- `centerFree:true` lays the type in side bands (left/right on wide frames, top/bottom on tall ones, switchable via `centerDir`) so a subject can stand in the middle. Use it for talking-head overlays and dance footage.
- Non-Japanese lyrics: set `lang` explicitly (`zh-Hant`, `zh-Hans`, `ko`, `en`) instead of trusting `auto`. The font roles swap to faces that have the glyphs; a wrong guess mixes faces inside one line on purpose-built styles. Latin-only lyrics are cut into short phrases, not single words.

## Reading a plan

Per-cut line: `[start–end] text | layout/enter/hold/exit | decor | treat | bg | cam`.

- Duration below ~0.6 s: unreadable. Either the line is too long for its slot (`/` splits it) or the tempo is wrong.
- Same `layout` on adjacent cuts: fine (that is `unify`), but three in a row reads as a mistake unless it is a deliberate repeat.
- Every cut carrying 2+ decor items and a busy `bg`: the frame is overfilled. Drop decor first, then `bg`.
- Empty `decor` everywhere: fine, and often better. Decoration is not a requirement.

## Seeds

`seed` is the whole arrangement. Two seeds with the same style give genuinely different structures — that is the cheapest way to explore, and it is why the tool takes a seed instead of "randomize". Keep the seed in the notes of the project you ship; without it the render cannot be reproduced.
