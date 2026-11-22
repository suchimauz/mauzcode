# Proposal

## Why

MauzCode has no single identity: browser tabs show a generic terminal-prompt `>_` glyph, the PWA/home-screen PNGs repeat it, and the desktop client ships an unrelated indigo "H" from an earlier name. The person picked a new mark — a cat face drawn from code braces `{ }` (option D) — and wants it used everywhere the app shows an icon.

## What Changes

- Add one canonical SVG of the cat-in-braces mark (dark rounded tile, mint braces, pink ears, white eyes, violet smile) as the single source of truth for every built-in icon.
- Built-in favicon (`ui.faviconUrl` default and `/favicon.ico` fallback) serves the new mark instead of the terminal prompt; the per-instance override via `ui.setFavicon` keeps working unchanged.
- Regenerate the PWA / home-screen PNGs served by `/ui/app-icon` (180, 192, 512) from the canonical SVG.
- Regenerate desktop assets (`icon.png`, `icon.ico`, `icon.icns`, `tray.png`, `trayTemplate.png`, `trayTemplate@2x.png`) from the same mark; the macOS template keeps a black-on-transparent silhouette.
- Give the browser extensions (`browser-extension`, `extensions/canvas-frames`) the mark as their toolbar/extension icon.
- Update wording that describes the old icons (desktop README "H", `ui.faviconUrl`/`ui.setFavicon` docs "terminal-prompt icon").

## Capabilities

### New Capabilities

- `app-icon`: the MauzCode brand icon — one canonical source and the guarantee that web favicon, PWA icons, desktop app/tray icons and extension icons are all derived from it.

### Modified Capabilities

None.

## Impact

- `src/ui/faviconUrl.ts`, `src/ui/assets/icon-{180,192,512}.png`, new canonical `src/ui/assets/icon.svg`.
- `desktop/generate-icons.cjs`, `desktop/assets/*`, `desktop/icons.test.ts`, `desktop/README.md`.
- `browser-extension/manifest.json`, `extensions/canvas-frames/manifest.json` plus icon PNGs.
- `src/ui/setFavicon.test.ts` (built-in icon expectations), doc strings of `ui.faviconUrl` / `ui.setFavicon` / `ui.favicon` setting.
- Possibly one new devDependency for SVG rasterization (see design.md).
