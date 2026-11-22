# Design

## Context

Icons are currently produced three different ways: an inline SVG string in `ui.faviconUrl`, hand-committed PNGs in `src/ui/assets`, and an analytic-shape rasterizer in `desktop/generate-icons.cjs` that draws the "H" with pure Node. No SVG rasterizer is installed (no rsvg/ImageMagick/Inkscape, no sharp/resvg in node_modules).

## Goals / Non-Goals

**Goals:**
- One canonical SVG (`src/ui/assets/icon.svg`) drives all built-in icons.
- One reproducible generator command writes every derived raster asset.
- Mark stays legible at 16 px (tab, tray).

**Non-Goals:**
- Renaming the product or changing window titles/text (name stays "MauzCode").
- Changing chat mascots or the `ui.setFavicon` override mechanism.
- Native visual QA on real Windows/macOS beyond format tests.

## Decisions

- **Canonical SVG in `src/ui/assets/icon.svg`.** `ui.faviconUrl` reads it instead of an inline string, so the favicon and rasters can never drift. Alternative — keep the inline string and duplicate it into the generator — rejected: two copies drift.
- **Rasterize with `@resvg/resvg-js` as a devDependency**, used only by the generator script. It is a self-contained WASM/native renderer with no system packages. Alternatives: hand-written path rasterizer (the D mark uses quadratic curves; too much bespoke code), headless Chrome screenshots (not reproducible in CI), committing PNGs exported by hand (violates single source).
- **Generator moves to `script/generate-icons.ts`** (run with `bun`), writing `src/ui/assets/icon-*.png`, `desktop/assets/*` and extension PNGs; `desktop` keeps `bun run icons` delegating to it and the old `desktop/generate-icons.cjs` is removed. ICO/ICNS container packing reuses the existing code.
- **Template tray icon**: render a variant of the SVG with a transparent tile and black braces/face, so macOS can tint the silhouette. Alternative — recolor the full tile black — rejected: it becomes a featureless square at 18 px.
- **Apple touch / PWA PNGs stay opaque** (tile on full-bleed dark background) because iOS adds its own mask.

## Risks / Trade-offs

- [New devDependency] → dev-only, not loaded by the server at runtime; checked-in outputs mean contributors need it only to regenerate.
- [16 px legibility of thin strokes] → stroke widths tuned in the SVG and verified by viewing the 16/32 px outputs before commit.
- [Existing `setFavicon.test.ts` asserts on the old built-in icon] → update expectations to the canonical SVG.
