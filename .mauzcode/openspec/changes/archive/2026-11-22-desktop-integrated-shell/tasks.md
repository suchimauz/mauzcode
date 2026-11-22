# Tasks

## 1. Live transport health

- [x] 1.1 Add `health` (`ok|lost`), `getHealth()` and `onHealth()` to `src/procs/events/client.js`; report `disconnected` to the desktop adapter only when lost; mark topic-change reconnects as planned; verify with `src/procs/events/client.status.test.ts` cases: topic change keeps health `ok`, `onerror` makes it `lost`, `hello`/open restores `ok`
- [x] 1.2 Make `DesktopLiveStatus.tsx` follow health (fallback to `disconnected`-only status for old servers) and extend `lib/live.ts` types; verify in `frontend/src/test/desktop-live-status.test.tsx` that a slow planned reconnect (> grace) shows nothing and a real failure shows loss then recovery

## 2. Integrated window frame and context menu (desktop)

- [x] 2.1 Add `desktop/window-chrome.cjs` (options per platform/theme) and apply it to the main and settings windows, hiding the menu bar on Windows/Linux; verify with `desktop/window-chrome.test.ts` for darwin/win32/linux × light/dark
- [x] 2.2 Add the shell popup menu template to `shell-menu.cjs` and keep accelerators in the application menu; verify with `desktop/shell-menu.test.ts`
- [x] 2.3 Add `mauzcodeDesktopWindow` to `remote-preload.cjs` and main handlers (`setTheme`, `openMenu`) gated by the active-origin check, store theme per origin, update overlay colours, fallback strip after 3 s; verify with a test that foreign frames/origins and invalid arguments are ignored
- [x] 2.4 Add `desktop/context-menu.cjs` and wire `context-menu` for both windows; verify with `desktop/context-menu.test.ts` (selection, editable, http link, non-http link, image, empty)

## 3. Title strip in the web app

- [x] 3.1 Add `DesktopTitleBar.tsx` (desktop only, platform-specific control insets, chat title, "⋯" button calling `openMenu`) above the app shell, and call `setTheme` from `useTheme`; verify with a frontend test for browser (absent) and desktop (rendered, insets, calls)

## 4. Settings window appearance

- [x] 4.1 Restyle `desktop/index.html`/`styles.css` with product tokens, grouped rows and the title strip; `renderer.js` applies `state().theme`; update `SETTINGS.md`; verify with `desktop/settings-ui.test.ts` (theme attribute, sections present) and a token-sync test against `frontend/src/styles/tokens.css`

## 5. Integration

- [x] 5.1 Run `bun test` and `bun run check` in `desktop/`, frontend tests, project typecheck; add the manual checklist (Windows, Linux X11/Wayland, macOS: drag, double-click, controls, context menu, agent switching, network loss) to `desktop/PILOT.md`
