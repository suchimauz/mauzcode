---
id: compatibility
title: compatibility
requires: [ui.eval]
order: 25
---
UI compatibility limits: the primary React shell does not load /ui/control.js; minimal SSR ui.layout still does. ui.eval returns dispatched:true for emission, not execution. An event subscriber alone proves neither that bridge nor a specific target.
