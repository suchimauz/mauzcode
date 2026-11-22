# Proposal

## Why

The brand icon from `unify-app-icon` exists, but the main React shell never links it: `frontend/index.html` and the sign-in document carry no `<link rel="icon">`, so browsers fall back to a cached `/favicon.ico`; the PWA manifest and `/ui/app-icon` are served yet referenced by no page, so phones never pick them up. Inside the UI the brand is still a letter "h" in a square (sidebar, compact sidebar, new-session welcome, UI LAB prototype).

## What Changes

- Link the favicon, `apple-touch-icon` and web manifest from the React shell document and the sign-in document.
- Replace the "h" brand mark in the sidebar, compact sidebar, new-session welcome and UI LAB prototype with the brand SVG.
- Give the desktop connection window and the documentation page the brand favicon.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-icon`: favicon and home-screen requirements extend to the React shell and sign-in pages; new requirement that in-app brand marks show the brand icon; the desktop connection window and docs page show it too.

## Impact

- `src/frontendRuntime/page.ts` (injects the links into the proxied shell document), `src/auth/reactDocument.ts`, `frontend/public/` (brand icon copy for the Vite base path).
- `frontend/src/components/mauzcode/WorkspaceSidebar.tsx`, `NewSessionWelcome.tsx`, `frontend/src/App.tsx`, `frontend/src/styles/ui.css`, related frontend tests.
- `desktop/index.html`, `docs/index.html`; `script/generate-icons.ts` copies the SVG where a static copy is needed.
