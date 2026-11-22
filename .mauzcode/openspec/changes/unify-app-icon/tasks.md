# Tasks

## 1. Canonical icon

- [ ] 1.1 Add `src/ui/assets/icon.svg` (option D: cat face from braces on dark tile) and verify by viewing it at 16, 48 and 128 px
- [ ] 1.2 Make `ui.faviconUrl` return the canonical SVG as the default data URL, update its and `ui.setFavicon` / `ui.favicon` setting docs, and verify `src/ui/setFavicon.test.ts` passes with updated expectations

## 2. Generator and raster assets

- [ ] 2.1 Add `@resvg/resvg-js` as a devDependency and verify `bun install` succeeds
- [ ] 2.2 Write `script/generate-icons.ts` that renders the SVG to web PNGs (180/192/512), desktop PNG/ICO/ICNS/tray assets and the black template tray icons; point `desktop` `bun run icons` to it; verify the command regenerates all files
- [ ] 2.3 Run the generator, inspect 16/32/512 px outputs visually, and verify `desktop/icons.test.ts` passes
- [ ] 2.4 Update `desktop/README.md` "Иконки" section to describe the new mark and generator, verify the documented command runs

## 3. Browser extensions

- [ ] 3.1 Generate 16/32/48/128 px icons into `browser-extension/icons/` and `extensions/canvas-frames/icons/`, declare `icons` / `action.default_icon` in both manifests, and verify the manifests parse and referenced files exist

## 4. Integration

- [ ] 4.1 Verify in a browser that the tab favicon, `/favicon.ico` and `/ui/app-icon?size=192` show the new mark, and that no legacy "H"/terminal-prompt asset remains (`rg` for the old inline SVG)

## Workflow follow-up

- Archive the change after review.
