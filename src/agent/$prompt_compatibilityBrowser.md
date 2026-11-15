---
id: compatibility-browser
title: Browser discovery prerequisites
requires: [plugins.search, plugins.read, browser.navigate]
order: 25
---
For browser automation, discover the browser plugin with plugins.search({ query: "browser automation" }), then plugins.read({ name: "browser" }) and follow its prerequisites rather than guessing APIs or Chrome availability.
