# dsh-jizura

日式「文字PV」（歌词动画）的 DSH 插件：输入歌词或字幕，输出视频。

[English](README.en.md)

![示例](docs/demo.gif)

示例用的是《神のまにまに - 初音ミク》：歌词和 LRC 直接给，`style: magenta`、`seed: 20261026`，一行代码没改。
完整片段（720p，含音轨）：[开头](docs/clips/01-intro.mp4) · [主歌](docs/clips/02-verse.mp4) · [副歌](docs/clips/03-chorus.mp4)

## 为什么做这个

原作的使用方式是完整的界面流程：打开浏览器、载入歌词、逐个试风格、对齐时间、导出，每一步都由人操作；此外还提供 After Effects 面板，需要单独安装和学习。

本插件保留引擎，去掉这条操作链。调用引擎的是 agent，输入是歌词或字幕加一句描述；挑风格、切 cut、出预览、渲染都由工具完成。因为引擎没有重写，部件、样式和渲染结果与原作一致。

## 这是什么

[852wa/JIZURA](https://github.com/852wa/JIZURA)（MIT）是一个浏览器里的歌词动画引擎：860 个部件、27 个样式包，按 seed 把歌词编排成一段段动画。

本插件让该引擎在无头 Chrome 里运行，包成 DSH 工具，由 agent 调用。部件目录、歌词语法、渲染规则以原作仓库为准。

| 工具 | 作用 |
|---|---|
| `jizura_parts` | 列出可用的风格、版面、装饰 |
| `jizura_plan` | 歌词或字幕 → cut 计划 + 联络图 + `project.json` |
| `jizura_render` | 生成 MP4，或透明前景/后景层 |
| `jizura_health` | 检查 Chrome、ffmpeg、引擎版本 |

## 安装

**需要**：DSH · Node ≥ 22 · Chrome 或 Chromium · ffmpeg

```bash
cd ~/.dsh/profiles/desktop
pnpm add github:sunleo994946-source/DSH_JIZURA
```

在 `~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 数组中添加一项：

```json
"bundles": ["...", "dsh-jizura"]
```

然后重启 DSH。插件在启动时加载，未重启时工具不会出现。装好后调用 `jizura_health` 确认 Chrome 与 ffmpeg 均可用。

> 工具未出现时按顺序检查：`bundles` 是否添加、是否重启、`node_modules/dsh-jizura` 是否存在。

## 用法

三个工具依次使用：

| 步骤 | 工具 | 产出 |
|---|---|---|
| 1 | `jizura_parts` | 可选的风格、版面、装饰清单 |
| 2 | `jizura_plan` | cut 计划 + 联络图（每个 cut 一帧）+ `project.json` |
| 3 | `jizura_render` | MP4，或透明前景/后景层 |

第 2 步的联络图用于确认效果，避免整片渲完才发现风格不对：

![联络图](docs/contact-sheet.jpg)

`jizura_render` 支持只渲一段（`from` / `to`），预览不必等整首渲完。

也可以不开 DSH，直接用命令行：`node tools/render.mjs --help`。

输出三种形态：

- **独立 MP4** — 完整成片，可混入音轨
- **黑底素材** — `keyBg: "black"`，用 `mix-blend-mode: screen` 叠到 HyperFrames 舞台
- **透明分层** — `png_back/` 与 `png_front/`，中间插入自有素材

## 提示词模板

替换 `{…}` 后使用。前两行必填，其余留空按默认值。

```
用 jizura 做一条文字PV。

歌词或字幕：{贴歌词，或给 .lrc / .srt 文件路径}
语言：{ja / zh-Hans / zh-Hant / ko / en}
画面：{9:16 竖屏 / 16:9}，{1080}p，{30}fps
风格：{一句话，例如"和風、纸感"、"赛博霓虹"、"印刷品黑白"}
交付：{独立 MP4 / 嵌进 HyperFrames 工程 <路径>}
音乐：{assets/song.mp3，没有则删除此行}
其它：{不要恐怖；保留 project.json 以便重渲}

先出联络图，我确认后再渲染整片。
```

字幕支持 `.srt` / `.lrc` / `.vtt`，时间戳作为每行的起始时刻；`.txt` 视为不带时间的歌词。双语歌词（原文 + 对照翻译共用时间戳）会按 `语言` 取一条，另一条丢弃。

插件不做音频节拍分析，字幕时间戳是让歌词对齐音乐的可行方式。

## 许可

插件 MIT，见 [LICENSE](LICENSE)。引擎来自 [852wa/JIZURA](https://github.com/852wa/JIZURA)，署名见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
