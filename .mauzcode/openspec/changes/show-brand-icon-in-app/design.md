# Design

## Context

The React shell is served by proxying Vite (`base: '/ui-lab/'`) through `frontendRuntime.page`; its `index.html` is static and built by Vite. `/favicon.ico`, `/ui/app-icon` and `/ui/manifest.webmanifest` are public routes (no auth), already allowed by `$middleware`. The sign-in document is an inline string with a strict CSP (`default-src 'none'`).

## Goals / Non-Goals

**Goals:** every MauzCode page the person opens shows the brand favicon; installed web app gets the brand icon; in-app brand mark is the icon.

**Non-Goals:** per-instance override of in-app brand marks (`ui.setFavicon` keeps affecting only the tab icon); changing the assistant avatar inside chat transcripts.

## Decisions

- **Shell links `/favicon.ico`, not a static file.** The route already honours the `ui.setFavicon` override and serves SVG with the right content type, so the shell gets the same icon as SSR pages without duplicating logic. Alternative — a static `frontend/public/icon.svg` link — rejected: it would ignore instance overrides.
- **Sign-in document**: links work under its CSP only if `img-src 'self'` is added (favicons are fetched as images; `manifest-src 'self'` for the manifest). Both are same-origin, so the policy stays tight.
- **In-app mark uses a static `frontend/public/brand-icon.svg`** (rendered via `<img src="/ui-lab/brand-icon.svg" alt="">` through Vite `BASE_URL`). The generator copies `src/ui/assets/icon.svg` there so the canonical source stays single. Inline React SVG was considered; an `<img>` keeps one file and lets the generator own it.
- **Desktop window and docs page** are standalone files with strict/no server: embed the SVG as a data URL in `<link rel="icon">`; desktop CSP gets `img-src data:`. The generator rewrites these data URLs so they cannot drift.

## Risks / Trade-offs

- [Browsers cache the old favicon aggressively] → the shell now links the icon explicitly; a hard reload clears the cache. Nothing else can be done server-side.
- [Generator touching HTML files] → it only replaces the content between a fixed `<link rel="icon" ... data-brand-icon>` marker; a test asserts the embedded data URL matches the canonical SVG.
