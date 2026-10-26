# dsh-jizura

把日式「文字PV」（歌词动画）接进 DSH：**歌词进，成片出**。

[English](README.en.md)

**为什么有这个** —— 原作是一套给人手操作的软件：打开浏览器界面、载入歌词、逐个调风格、对时间、导出。这些在这里都不存在了，因为**操作的人换成了 AI**：你把歌词和要求讲清楚，它自己挑风格、出联络图、改 seed、渲片。原来要学一整套界面，现在只要会说需求。

> 引擎是 [852wa/JIZURA](https://github.com/852wa/JIZURA)（MIT）——860 个部件、27 个样式包、歌词语法、渲染细节都在原作仓库。
> **本仓库只做 DSH 插件封装**：把引擎包成工具，外加一个 HyperFrames 交接技能。

![联络图](docs/contact-sheet.jpg)

**能做什么**

| 工具 | 作用 |
|---|---|
| `jizura_parts` | 查有哪些风格 / 版面 / 装饰可选 |
| `jizura_plan` | 歌词或字幕 → cut 计划 + 联络图（每 cut 一帧，先看再渲） |
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

## 怎么跟 AI 说

复制下面这段，把 `{…}` 换成你的真实内容。**只有前两行必填**，其余不填就按默认走：

```
用 jizura 做一条文字PV。

歌词或字幕：{贴歌词，或给 .lrc / .srt 文件路径}
语言：{ja / zh-Hans / zh-Hant / ko / en}
画面：{9:16 竖屏 / 16:9}，{1080}p，{30}fps
风格：{一句话，例如"和風、纸感"、"赛博霓虹"、"印刷品黑白"}
交付：{独立 MP4 / 嵌进 HyperFrames 工程 <路径>}
音乐：{assets/song.mp3，没有就删掉这行}
其它：{不要恐怖；保留 project.json 方便重渲}

先出联络图给我看，我确认后再渲全片。
```

**关于字幕**：`.srt` / `.lrc` / `.vtt` 都能直接给。时间戳会变成每行的起始时刻——比按字数猜准得多，也不需要额外的音频分析。纯 `.txt` 也可以，那就是无时间的歌词。

**你要交代清楚的只有**：歌词（或字幕）、语言。剩下的（挑风格、定 seed、切 cut、渲图）AI 会自己跑，跑完给你看联络图。

> AI 不需要你提供部件 key、seed 或浏览器操作；它自己有 `jizura_parts` 和 `jizura_plan`。

## 使用流程

```
jizura_parts → jizura_plan（看联络图定稿）→ jizura_render
```

关键是第二步的联络图：一张图里每个 cut 一帧，先看它调风格，满意了再渲全片。

三种交付形式：独立 MP4 / 黑底色键叠到 HyperFrames / 透明前后景层夹住素材。

## 许可

插件 MIT，见 [LICENSE](LICENSE)。引擎来自 [852wa/JIZURA](https://github.com/852wa/JIZURA)，署名见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
