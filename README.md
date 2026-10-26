# dsh-jizura

把日式「文字PV」（歌词动画）接进 DSH：**歌词进，成片出**。

[English](README.en.md)

![联络图](docs/contact-sheet.jpg)

> 引擎是 [852wa/JIZURA](https://github.com/852wa/JIZURA)（MIT）——860 个部件、27 个样式包、歌词语法、渲染细节都在原作仓库。
> **本仓库只做 DSH 插件封装**：把引擎包成工具，外加一个 HyperFrames 交接技能。

**能做什么**

| 工具 | 作用 |
|---|---|
| `jizura_parts` | 查有哪些风格 / 版面 / 装饰可选 |
| `jizura_plan` | 歌词 → cut 计划 + 联络图（每 cut 一帧，先看再渲） |
| `jizura_render` | 出 MP4，或出透明前景/后景层交给 HyperFrames |
| `jizura_health` | 自检 Chrome / ffmpeg / 引擎版本 |

## 安装

**需要**：DSH · Node ≥ 22 · Chrome 或 Chromium · ffmpeg

```bash
cd ~/.dsh/profiles/desktop
pnpm add github:sunleo994946-source/DSH_JIZURA
```

然后在 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 数组里加一项：

```json
"bundles": ["...", "dsh-jizura"]
```

**重启 DSH。** 重启后让 AI 跑一句 `jizura_health`，看到 Chrome 和 ffmpeg 都是 ✅ 就成了。

> 没生效的三种原因：忘加 `bundles`、忘了重启、`node_modules/dsh-jizura` 不存在。

## 使用

AI 会按这个顺序走，你不用记：

```
jizura_parts → jizura_plan（看联络图定稿）→ jizura_render
```

关键是第二步：`jizura_plan` 会渲一张联络图，先看图调风格，满意了再渲全片。

三种交付形式：独立 MP4 / 黑底色键叠到 HyperFrames / 透明前后景层夹住素材。

## 给 AI 提供什么

**必需**

- **歌词**：一行一句
- **语言**：`ja` / `zh-Hans` / `zh-Hant` / `ko` / `en`（非日文务必说明，否则整行会混字体）

**建议**：画面比（`16:9` / `9:16`…）、交付形式、风格描述（"和風、紙感" 这类词就够）、禁忌。

**可选**：音乐路径、主题（`lyricpv`/`kinetic`/`wa`/`pop`/`ballad`）、HyperFrames 工程路径。

一段可直接抄的：

```
用 jizura 给这首歌做文字PV。
歌词（日语）：
夜明けの色を/覚えてる
ほどけた声が遠くで鳴った
语言 ja，竖屏 9:16，1080p，30fps，和風纸感。
先出联络图给我看，看完再渲。要独立 MP4，音乐用 assets/song.mp3。
保留 project.json，我要能重渲。
```

> 不用查部件 key、不用挑 seed、不用手动开浏览器。

## 许可

插件 MIT，见 [LICENSE](LICENSE)。引擎来自 [852wa/JIZURA](https://github.com/852wa/JIZURA)，署名见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
