---
id: compatibility-screen
title: Screen compatibility
requires: [screen.eval, screen.openTab]
order: 25
---
screen.eval waits for a result through the compatibility bridge and can time out; its consumer requires window.page from the screen client, even for plain DOM code. screen.openTab first needs screen.eval for the origin before using CDP.
