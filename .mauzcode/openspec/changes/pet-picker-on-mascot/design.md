# Design

## Context

`NewSessionComposer` renders `MascotPicker` (a Base UI `Menu` with a chip trigger) in the chip row and, separately, a `CrabMascot` preview above the input. Each mascot renderer (`AnimatedPet`, `TokibeanMascot`, `ImageMascot`) owns a `.crab-hit` button that plays the poke reaction. "Random" currently renders the preview with `page = null`, which falls back to the crab.

## Goals / Non-Goals

**Goals:**
- One entry point for the pet choice: the mascot itself.
- Keep the menu content, accessibility and lock behaviour of the existing picker.

**Non-Goals:**
- Changing pet choice for existing chats.
- Changing the catalogue, persistence or the submit contract.

## Decisions

- **Menu trigger wraps the mascot.** `MascotPicker` keeps the menu and receives the preview as children; its `Menu.Trigger` becomes a transparent button over the mascot area, positioned like `.crab-hit`. Alternative: pass an `onActivate` prop into every renderer's hit button — rejected, it spreads picker logic into three renderers.
- **Renderers get an `interactive={false}` mode.** In the new session the renderer omits its own poke button so there is a single focusable control and no nested buttons. Idle animation keeps running.
- **Accessible name** `Выбрать питомца: <name|Случайный>` on the trigger; the menu keeps its label `Питомец нового чата`.
- **Random preview** stays as today (fallback pet) plus a small shuffle badge on the trigger so "Random" is visible without the chip text.

## Risks / Trade-offs

- [Pet hit area differs per pet] → reuse the existing per-pet `.crab-hit` geometry for the trigger via `data-pet`.
- [Discoverability without text] → hover/focus `title` tooltip with the accessible name and the shuffle badge for random.
