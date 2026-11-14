# Model marks

The shared catalogue is `ui.modelLogo`; React consumes it through `frontendBridge.modelMark` as monochrome CSS masks (currentColor in light and dark themes). Providers may declare `icon: "brand:opencode"` without provider-specific core branches. A recognised model family takes precedence; an unknown family uses the provider mark or generic plug, not a guessed model brand.

## Added marks and provenance

Source: [Lobe Icons](https://github.com/lobehub/lobe-icons), pinned commit [55746b0b082258211121c70bd26e6878fd3bd292](https://github.com/lobehub/lobe-icons/tree/55746b0b082258211121c70bd26e6878fd3bd292), MIT (copyright notice below). These are catalogue renditions of brand marks, not a claim of official endorsement; trademarks remain with their owners.

| Mark | Source SVG under packages/static-svg/icons | Model family |
| --- | --- | --- |
| OpenCode | opencode.svg | provider declaration; replaces the invented terminal drawing |
| Tencent Hunyuan | hunyuan.svg | hunyuan, hy3, hy4 |
| Xiaomi MiMo | xiaomimimo.svg | mimo-* |
| LongCat | longcat.svg | longcat-* |
| StepFun | stepfun.svg | step-<number> |
| Meta Muse | muse.svg | muse-spark-* |

All paths: https://github.com/lobehub/lobe-icons/tree/55746b0b082258211121c70bd26e6878fd3bd292/packages/static-svg/icons

Family evidence: https://github.com/lobehub/lobe-icons/blob/55746b0b082258211121c70bd26e6878fd3bd292/src/features/modelConfig.ts explicitly associates Hunyuan with hy3/hy4, XiaomiMiMo with mimo-, LongCat with longcat, Stepfun with step, and Meta Muse with muse-spark. We deliberately narrow patterns to avoid substring collisions. Version suffixes are not endorsements or verification of gateway model claims.

Only static numeric path data is embedded; no downloaded code executes. Multiple paths are concatenated; original viewBox (0 0 24 24) and evenodd/nonzero fill rules are preserved. No scripts, remote resources, style attributes, handlers or HTML are imported.

Go catalogue inspected: 30 cached models. Newly covered: muse-spark-1.2/1.3-contributor, hy3, hy4-preview, hy4, mimo-v2.6-flash/pro, longcat-2.0/2.5-free, step-5-preview. Existing families remain DeepSeek, GLM, Grok, GPT, Claude, Kimi, MiniMax, Qwen and Gemini. beam-free and iceman-contributor-free have no verified brand mapping; keep the honest provider/generic fallback. No model defaults, enablement flags or credentials changed.

## Lobe Icons license

MIT License

Copyright (c) 2023 LobeHub

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
