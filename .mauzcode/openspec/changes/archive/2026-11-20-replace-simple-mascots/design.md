# Design

## Context

See proposal.md (Why). Today `CrabMascot` is the single entry point. It sends `desksprite` to `DeskSpriteMascot` (the vendored engine), the four OpenPets to `OpenPetMascot` (9-row Codex atlas), and crab/deepy/whalegirl to `AnimatedPet` (dsh sprite sheets). The chat page (`EventPage`) exposes `isRunning`, `thinking`, `activeTools[]` (tool name and args), `lastError` and `compactionRetry`. The mascot value is a Postgres `agents.mascot` column with a CHECK list and a volatile random default. The same list is repeated in the new-session bridge, the events API type and the frontend registry.

Upstream sources, inspected at these commits:

| Pets | Source | Format | License |
| --- | --- | --- | --- |
| dundun, tabby, shiba, maneki, daruma, tuerye | zghey/tokibean `4a22bc74` `src/pet.js`, `src/skins/*.js` | IIFE scripts. Each sets `window.PetRenderer.draw(ctx, canvas, state, warn, bubble, t, extra)` and draws on a 288×184 canvas. `pet.js` also sets `window.PetKit`. | MIT |
| calico | rullerzhou-afk/clawd-on-desk `abf605a9` `themes/calico/assets/*.apng` | Transparent animated PNGs (its GIF exports have an opaque black background) | All rights reserved |
| cloudling | same repo, `assets/gif/cloudling-*.gif` | Transparent animated GIFs | All rights reserved |
| clawd | same repo, `assets/svg/clawd-*.svg` | CSS-animated SVGs, no scripts | Anthropic character, fan art, non-commercial |
| claude | Harriszed/claude-desktop-pet `e799a6e2` `assets/*.svg` | CSS-animated SVGs, no scripts | No artwork license |

The Cloudling SVG theme animates through embedded scripts, so its pre-rendered GIFs are used instead.

## Goals / Non-Goals

- Goal: one shared activity classification, so every renderer reacts to the same signals.
- Goal: keep crab, deepy and whalegirl rendering exactly as they do now.
- Non-goal: roaming, cursor following, speech bubbles or quota displays from the upstream apps.
- Non-goal: drag-and-throw. Pointer interaction stays a short local reaction, like the crab's.

## Decisions

### Shared activity classifier

`frontend/src/lib/mascotActivity.ts` maps a page to one of: `idle`, `thinking`, `command`, `git`, `testing`, `editing`, `reading`, `searching`, `browsing`, `delegating`, `planning`, `waiting`, `compacting`, `error`. It looks at the first active tool:

- `bash` → `command`; `git` or `testing` when the command starts with `git` or runs tests.
- `edit` or `write` → `editing`; `read` or `read_result` → `reading`; `grep` or `find` → `searching`.
- Names containing web, browser or fetch → `browsing`; `delegate_task` → `delegating`.
- `todo_update` or `todo_done` → `planning`; `request_input` → `waiting`.
- Other tools (eval and the like) → `command`.

With no active tool: `compactionRetry` → `compacting`, `thinking` or `isRunning` → `thinking`, `lastError` → `error`, otherwise `idle`. Each renderer keeps its own "done" reaction, sleep timer and poke handling. Alternative considered: a per-renderer mapping from raw page fields. It was rejected because the tool tables would be duplicated three times.

### Tokibean renderer

The upstream files are vendored byte-for-byte under `frontend/src/vendor/tokibean/`. Each skin overwrites the global `window.PetRenderer`, so each pet gets a tiny wrapper module. The wrapper imports the vendored file for its side effect, then captures `window.PetRenderer` in its own module body. ES module evaluation order guarantees the capture happens before the next skin loads; `pet.js` (PetKit) is imported first. Alternative considered: patching the scripts to export. Rejected so the files stay identical to upstream.

`TokibeanMascot` owns a 288×184 logical canvas, drawn at device pixel ratio and shown scaled down in CSS. A `requestAnimationFrame` loop calls `draw` with the frame counter:

- `idle` → state `idle`.
- `thinking` → `working` with no tool note. This is upstream's own thinking animation.
- Tool activities → `working` with `toolNote` = `cmd`, `git`, `testing`, `coding`, `reading`, `searching`, `browsing` or `planning`.
- `delegating` → `working` with `agentCount: 1`.
- `waiting` → `attention`.
- `compacting` → `working` with `toolNote: planning`.
- `error` → `idle` with `oops: true`.
- The end of a run → `done` with `celebrate: 1` for 3 s. More than 60 s of quiet → `limit` (sleeping).
- A poke → `tickle` for 1.5 s; hovering → `pat`.

Under reduced motion it draws a single frame and starts no loop. The ambient sky (moon, seasons, weather) stays: it is part of the upstream skins.

### Image renderer

`ImageMascot` is driven by a static manifest per pet: activity → file, plus `done`, `sleeping`, `poke` and optional idle extras, with a fallback chain `activity → working → idle`. It renders `<img src>` from `public/mascot/<pet>/`. Images never execute scripts, and none of the chosen files contain any. Under reduced motion it paints the image once on a `<canvas>`, which captures a single still frame, instead of showing the animated `<img>`. Alternative considered: decoding GIF frames into sprite sheets at build time. Rejected as a heavier pipeline with no visible gain.

### Routing and registry

`mascots.ts` stays the single frontend list, with a `kind` for each pet: `sheet`, `tokibean` or `image`. `CrabMascot` dispatches on it. `EventPage.mascot` uses the `Mascot` type. The backend's two literal lists are replaced with the new 13 values.

### Migration

The new `src/agent/$migration_20390305000000_agent_mascot_catalogue.ts` runs in one transaction:

1. Drop the CHECK constraint.
2. Update rows with a removed pet to `(ARRAY[...13])[1 + floor(random()*13)::int]`.
3. Re-add the CHECK with the 13 values.
4. Set the new random default.

Repeating it changes nothing, because no removed values remain. Older migrations stay untouched.

## Risks / Trade-offs

- [Unlicensed artwork in a public repository] → The owner decided to commit it. NOTICE and provenance files name the owners and make no license claim. Removal is a revert of the asset commit.
- [Tokibean module state is shared by every instance of the same skin] → Usually only one chat composer is visible. Storybook may show shared blink and roam state, which is harmless.
- [Large animations, about 10 MB in total] → Only the current state's file loads, and the browser caches it.
- [Live database still has the old CHECK until migrations run] → The migration runs on the normal startup path. Until then, choosing a new pet explicitly would be rejected by the database, so the server should restart (or the migration be applied) right after deploy.

## Migration Plan

Deploy the code and run the startup migration. Rollback means reverting the code and running a reverse SQL that restores the eight-value CHECK. Reassigned chats keep their new pet.
