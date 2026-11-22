# Tasks

## 1. Page icon links

- [ ] 1.1 Add `<link rel="icon" href="/favicon.ico">`, `apple-touch-icon` (`/ui/app-icon?size=180`), `manifest` (`/ui/manifest.webmanifest`) and dark `theme-color` to `frontend/index.html`; verify the proxied shell HTML contains them
- [ ] 1.2 Add the same links to the sign-in document in `src/auth/reactDocument.ts` and extend its CSP with `img-src 'self'; manifest-src 'self'`; verify with a unit test on the served document and headers

## 2. In-app brand mark

- [ ] 2.1 Make `script/generate-icons.ts` copy the canonical SVG to `frontend/public/brand-icon.svg`; verify the file matches after running it
- [ ] 2.2 Replace the "h" brand mark in `WorkspaceSidebar.tsx` (expanded and compact), `NewSessionWelcome.tsx` and `App.tsx` with a decorative brand icon image and adjust `.brand-mark` styles; update `new-session-welcome.test.tsx` and verify `bun run frontend:test` and `tsc -b frontend/tsconfig.json` pass

## 3. Standalone pages

- [ ] 3.1 Have the generator write a brand data-URL favicon into `desktop/index.html` (CSP `img-src data:`) and `docs/index.html`; add a test that both embedded icons decode to the canonical SVG, and verify it passes

## 4. Integration

- [ ] 4.1 Verify in the browser that the main UI tab, sign-in page and sidebar show the brand icon, and run `bun run test` and `tsc --noEmit`

## Workflow follow-up

- Archive the change after implementation.
