# Proposal

## Why

Crab, Deepy and Whalegirl have a distinct animation for each kind of agent activity: thinking, typing, building, compacting, sleeping, errors and reactions. DeskSprite and the four OpenPets pets (Bitty, TmuxAI, Planet, Rainbow Terminal Cat) only have a few generic states, so they look the same whatever the agent is doing. The owner wants to drop these simple pets and add pets whose animations follow the agent's activity as closely as the existing three.

## What Changes

- **BREAKING** Remove DeskSprite, Bitty, TmuxAI, Planet and Rainbow Terminal Cat, including their artwork, vendored engine, renderers and tests. Chats that already use one of them get a random pet from the new list.
- Add six Tokibean pets (MIT, by ZGhey): Dundun, Tabby, Shiba, Maneki, Daruma and Tu'er Ye. Their upstream canvas renderers are vendored unchanged and driven by MauzCode activity: thinking, running a command, editing code, reading, searching, browsing, delegating, planning, done, error, waiting, being dragged and idle.
- Add three Clawd on Desk pets: Calico, Cloudling and Clawd. Add the Claude pet from Claude Desktop Pet (Harriszed). These use per-state animated images from upstream: thinking, typing, building, reading, sweeping, conducting, done, error, sleeping and reactions. The owner chose to bundle this artwork even though it is not openly licensed; provenance and rights notices are kept next to the files.
- The persistent chat mascot list grows from 8 to 13 choices: crab, deepy, whalegirl, dundun, tabby, shiba, maneki, daruma, tuerye, calico, cloudling, clawd and claude. New chats and "random" pick uniformly from it.
- The new-session pet picker lists the same 13 pets.

## Capabilities

### New Capabilities

- `chat-mascots`: the pets a chat can have, how a pet is assigned and kept, and how its animation reflects agent activity.

### Modified Capabilities

None. `chat-composer-layout` and `new-session-options` only reference the mascot generically, and their requirements are unchanged.

## Impact

- Database: a migration narrows `agents.mascot` to the new 13 values, reassigns rows that use a removed pet, and updates the random default.
- Backend: the new-session bridge validation list and the events API mascot type.
- Frontend: the mascot registry and picker, a Tokibean canvas renderer, an animated-image renderer for the Clawd on Desk and Claude pets, removal of `DeskSpriteMascot`, `OpenPetMascot` and `vendor/desksprite`, plus tests and Storybook.
- Assets: about 8 MB of new artwork under `frontend/public/mascot/` and `frontend/src/vendor/tokibean/`; about 6 MB of removed artwork.
- Licensing: Tokibean is MIT. Clawd on Desk and Claude Desktop Pet artwork is "all rights reserved" or unlicensed. It is bundled at the owner's explicit request, with notices that make no license claim.
