# Tokibean pet renderers (MIT)

Upstream: https://github.com/zghey/tokibean
Pinned commit: `4a22bc749972321926100ace96e7f05341533f99`
Files: `src/pet.js` (default skin Dundun and the shared `window.PetKit`) and `src/skins/{daruma,maneki,shiba,tabby,tuerye}.js`.

SHA-256 (unmodified upstream bytes):

```
a224733854a027c3d254f19fb84206080c226d4488bd19d33a6232fd7c838c7d  pet.js
da4748a7b6a71dd61d30ad23a3fb0f6945164d0cf296661e843615b5fbe3feba  daruma.js
de5f56c123538e992c0f0b259f5ed9a4bb57e39d9065b061d2e437348ebdb5f4  maneki.js
137616b6372433fd4863d4794f2ad64cfe934ac601b69efab89679d1bf159ccf  shiba.js
a574b3d48528dcf5fa8a6b24958c31bb2f657f5448c848c4c5e183c6146dba81  tabby.js
cd90b252d989194b061681612fc1de8c92d2fc749cd6522f3c2602462906459a  tuerye.js
```

Copyright (c) 2026 ZGhey; full MIT license in LICENSE. Each file is an IIFE that assigns `window.PetRenderer = { draw }`. MauzCode imports them in order through `tokibeanSkins.ts`, capturing each renderer before the next skin replaces it. No upstream app code (Tauri, hooks, quota, settings) is included; MauzCode drives `draw` from chat activity.
