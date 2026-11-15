---
id: compatibility-action
title: UI event compatibility
requires: [ui.action]
order: 25
---
ui.action returns dispatched:true for emission, not execution. Navigation and toast events need a compatible consumer; an event subscriber alone proves neither the bridge nor a specific target.
