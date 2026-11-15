---
id: compatibility
title: compatibility
requires: [ui.eval]
order: 25
---
UI compatibility limits: the primary React shell does not load /ui/control.js; minimal SSR ui.layout still does. ui.eval/action return dispatched:true for emission, not execution; navigation and toast events likewise need a compatible consumer. An event subscriber alone proves neither that bridge nor a specific target. screen.eval waits for a result through the compatibility bridge and can time out; its consumer requires window.page from the screen client, even for plain DOM code. screen.openTab first needs screen.eval for the origin before using CDP. These limits do not disable server-side ui.createAgent/sendToAgent effects; their optional navigation is best-effort. For browser automation, discover the browser plugin with plugins.search({ query: "browser automation" }), then plugins.read({ name: "browser" }) and follow its prerequisites rather than guessing APIs or Chrome availability. To show files beside chat, use canvas.show with kind:"file".
