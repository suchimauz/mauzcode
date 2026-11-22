# Design

## Context

- `desktop/main.cjs` creates plain `BrowserWindow`s with the OS frame and sets one application menu (`shell-menu.cjs`) that Windows/Linux render as a menu bar. No `context-menu` handler exists.
- The remote page is sandboxed; `remote-preload.cjs` exposes only `mauzcodeDesktopLive`, and main validates every IPC sender through `notifications.cjs` `active(event)` (top frame, active origin).
- `src/procs/events/client.js` replaces the SSE stream whenever the set of `data-live-topic` regions changes (agent switch). It goes `connecting → connected` without `disconnected`, but `DesktopLiveStatus.tsx` treats any `connecting` after the first connection as a possible loss and announces it after 1.5 s; on a remote server the reopen often takes longer. `refreshTopics(true)` from `liveRefresh.attach` also marks a catch-up reconnect as unplanned.
- The theme is a browser-local preference (`useTheme`, `localStorage`), resolved to `light`/`dark` on the page. The settings window (`desktop/index.html`) cannot read it directly.

## Goals / Non-Goals

**Goals:** one visual frame on three OSes using only Electron APIs; announcements driven by transport errors, not stream replacement; no new privilege for remote content.

**Non-Goals:** custom-drawn window controls; spell-check suggestions; changing the browser (non-desktop) UI; loading the server's web fonts into the local settings window.

## Decisions

### D1. `titleBarStyle: 'hidden'` + `titleBarOverlay` (Windows, Linux), `hiddenInset` (macOS)
Native controls stay native (snap layouts on Windows, accessibility, traffic lights) and only their colours follow the theme through `setTitleBarOverlay`. Alternative `frame: false` with HTML controls was rejected: it loses snap layouts and needs per-OS button sets. A pure `window-chrome.cjs` returns options per platform/theme so it is unit-testable without Electron.

### D2. Keep the application menu, hide the bar
Accelerators live in the application menu; removing it removes shortcuts. Windows/Linux windows call `setMenuBarVisibility(false)` with `autoHideMenuBar: false` so Alt does not reveal it. The same template (minus Edit/Window roles that make no sense in a popup) is shown by `Menu.popup` from the "⋯" button.

### D3. `mauzcodeDesktopWindow` bridge
Frozen object in `remote-preload.cjs` (main frame only): `platform`, `titleBar {height: 40, controls}`, `setTheme('light'|'dark')`, `openMenu(x, y)` with finite numbers clamped to the window. Main handles both channels only when `active(event)` holds, so foreign frames/origins are ignored. The resolved theme is stored per origin in the profile (`preferences.set(origin, 'theme')`) and used for new windows' `backgroundColor`/overlay and for the settings window state, giving "follow the server-selected theme, else system".

### D4. Fallback strip for older servers
If the active page has not called `setTheme` within 3 s after `did-finish-load`, main inserts a minimal CSS rule (`body::before` fixed 40 px drag strip with `padding-top` on body) via `insertCSS`. Cancelled when `setTheme` arrives. Keeps old servers draggable without new trust.

### D5. Transport health separate from status
`client.js` keeps `status` (`connecting|connected|disconnected`) for existing users and adds `health` (`ok|lost`): `lost` only on `onerror`, `pagehide`, or HTTP/1.1 hide-disconnect; `ok` on `onopen`/`hello`. `getHealth()`/`onHealth()` are added to `window.mauzcodeLive`. The desktop adapter `desktop.status()` reports `disconnected` only on `lost`, otherwise `connected`/`connecting`, so the settings window does not show "reconnecting" for planned swaps. `refreshTopics(catchUp)` keeps its catch-up resync (React regions render without a server cursor, so skipping it could lose events), but the replacement no longer affects health, so it cannot produce a banner. `DesktopLiveStatus` subscribes to health; without `onHealth` (old server) it falls back to status but only reacts to `disconnected`.

### D6. Context menu as a pure template
`context-menu.cjs` maps Electron `context-menu` params to a template: edit roles by `editFlags`, link items only for `webURL`-valid http(s) links (open goes through existing `openExternal` with its dialog), `copyImageAt` for `mediaType === 'image'`. Main window handler checks the frame is the active origin's main frame or same-origin; settings window gets edit items only.

### D7. Settings styling
`desktop/styles.css` copies the token values from `frontend/src/styles/tokens.css` (light/dark), uses `[data-theme]` set by `renderer.js` from `state().theme` (`light|dark|''` → system media query). Same 40 px drag strip with the title; sections become `--settings-group` rounded groups with label/value/action rows. Copy, not import: the local window must work offline and is packaged separately.

## Risks / Trade-offs

- [`titleBarOverlay` on some Linux WMs/Wayland renders imperfectly] → documented in `PILOT.md`; manual check on GNOME Wayland and X11.
- [Token values drift between frontend and desktop] → a desktop test compares the accent/background values with `frontend/src/styles/tokens.css`.
- [New client + old server: no in-page strip] → D4 fallback.
- [Old client + new server] → `DesktopTitleBar` renders only when the bridge exists; nothing changes.

## Migration Plan

Ship server (client.js, frontend) and desktop together; each side degrades gracefully without the other. Rollback = revert the desktop release; the server change is backward compatible.
