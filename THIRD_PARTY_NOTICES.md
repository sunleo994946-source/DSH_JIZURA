# 第三方声明

## JIZURA

本插件的 `engine/engine.js`、`engine/parts.json` 是 [852wa/JIZURA](https://github.com/852wa/JIZURA) 的派生产物：

- `engine/engine.js` —— 由 `JIZURA/src/*.js` 按文件名顺序拼接而成，代码未经修改
- `engine/parts.json` —— 从引擎运行时导出（部件 key、日中名称、标签、部品セット）

沿用其 MIT 许可：

```
MIT License

Copyright (c) JIZURA contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

上游版本：JIZURA 0.10.1（commit `fc16bfe`）。重新生成见 `tools/bundle-engine.mjs`。

## 运行时依赖（不打包进本仓库）

- **Chrome / Chromium / Edge** —— 用户本机安装
- **ffmpeg** —— 用户本机安装（libx264 / AAC / ProRes）
