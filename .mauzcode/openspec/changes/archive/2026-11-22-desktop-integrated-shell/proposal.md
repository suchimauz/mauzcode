## Why

The desktop client looks like a browser wrapped in a stock window: Windows and Linux show the default menu bar and a system title bar that does not match MauzCode, right-click offers no Copy, switching between agents flashes "Связь потеряна" / "Связь восстановлена", and the local settings window uses its own blue palette instead of the product's design tokens.

## What Changes

- Integrated window frame on Windows, Linux and macOS: hidden system title bar, native window controls drawn over a 40 px MauzCode-coloured title strip (`titleBarOverlay` on Windows/Linux, inset traffic lights on macOS), no visible menu bar on Windows/Linux while every existing keyboard shortcut keeps working.
- A "⋯" button in the title strip opens the shell menu (settings, retry, reload, zoom, quit) as a native popup.
- A native right-click context menu: cut/copy/paste/select all, copy link address, open link in browser (through the existing confirmation), copy image.
- A narrow `mauzcodeDesktopWindow` bridge for the top-level server page only: platform, title-bar geometry, `setTheme`, `openMenu`.
- The live transport separates a planned stream replacement (topic change on agent switch, manual retry) from a real transport failure; the desktop banner reacts only to real failures.
- The local settings window uses the product's tokens, typography, radii, grouped rows and the same integrated title strip, and follows the theme chosen on the server.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `desktop-server-connection`: loss/recovery is announced only for a real transport failure; settings follow the product appearance and the server-selected theme.
- `desktop-native-integration`: integrated window frame, native context menu, and the remote-content boundary covering the new window bridge.

## Impact

- `desktop/`: `main.cjs`, `remote-preload.cjs`, `preload.cjs`, `shell-menu.cjs`, `notifications.cjs`, new `window-chrome.cjs`, `context-menu.cjs`, `index.html`, `styles.css`, `renderer.js`, tests, `PILOT.md`, `SETTINGS.md`.
- `src/procs/events/client.js`: transport health (`getHealth`, `onHealth`).
- `frontend/src`: `DesktopLiveStatus.tsx`, new `DesktopTitleBar.tsx`, `useTheme`, `LiveApp.tsx`/shell layout, `lib/live.ts` types, styles, tests.
- No server API or dependency changes. Older servers keep working with the new client (fallback drag strip); older clients ignore the new UI.
