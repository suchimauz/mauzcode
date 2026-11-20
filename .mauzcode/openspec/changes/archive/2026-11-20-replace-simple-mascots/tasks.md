# Tasks

## 1. Artwork and vendored code

- [x] 1.1 Vendor Tokibean `pet.js` and the five skins unchanged under `frontend/src/vendor/tokibean/`, with LICENSE and a README recording the upstream commit and SHA-256 of each file. Verify the hashes match upstream.
- [x] 1.2 Copy the Calico APNGs (transparent; the GIF exports are opaque), the Cloudling GIFs, the Clawd SVGs and the Claude SVGs into `frontend/public/mascot/<pet>/`, with `provenance.json` and rights notices. Verify that no copied file contains `<script` or an external URL.
- [x] 1.3 Delete the DeskSprite vendor directory, the OpenPets artwork directories and their notices. Update `public/mascot/NOTICE.md`.

## 2. Backend

- [x] 2.1 Add the catalogue migration (reassign removed pets, 13-value CHECK, 13-value random default) and extend `src/agent/agentMascot.test.ts`: reassignment, idempotency, preserved assignments, all 13 occur, invalid values rejected.
- [x] 2.2 Update the new-session bridge list and the events API mascot type. Update `src/frontendBridge/new-session.test.ts` so a removed pet is rejected and a new pet is accepted.

## 3. Frontend

- [x] 3.1 Add the `mascotActivity` classifier with unit tests for every tool mapping and fallback.
- [x] 3.2 Add `TokibeanMascot` and the per-skin capture modules. Tests: state and tool-note mapping, done and sleep transitions, reduced motion draws one frame, poke reaction, button disabled while running.
- [x] 3.3 Add `ImageMascot` and the manifests for calico, cloudling, clawd and claude. Tests: activity → file, fallback chain, done and error reactions, reduced motion shows a still canvas.
- [x] 3.4 Update the `mascots.ts` registry, `EventPage.mascot`, `CrabMascot` routing and the picker. Remove `DeskSpriteMascot` and `OpenPetMascot` with their CSS and tests. Update the picker, new-session and Storybook fixtures.
- [x] 3.5 Size and position each new pet in the composer perch so it matches the existing pets. Check it in the browser at 720 and 320 px widths.

## 4. Verification

- [x] 4.1 Run the frontend mascot tests and the backend mascot and new-session tests, the frontend build (`tsc -b` + vite) and one whole-project typecheck.
- [x] 4.2 Run `openspec validate replace-simple-mascots --strict`.
