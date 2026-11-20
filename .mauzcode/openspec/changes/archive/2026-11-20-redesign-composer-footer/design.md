# Design

## Context

`ComposerFooter` renders a three-column grid: add button and planning badge, a centered usage line (`composer-usage-line`, scrolls sideways when tight), then model picker, context meter and the voice group. `LiveApp` anchors `CrabMascot` above the input inside `composer-input-anchor`. `VoiceEntryControls` renders inline input (`Mic`), voice mode (`AudioWaveform`) and `VoiceRoutePicker` (`AudioLines`), in that order. The agreed mockups (variant D2 with voice area V3) were built from the real markup and CSS.

## Goals / Non-Goals

**Goals:**
- Same component API for the live and new-session composers where they share parts.
- Container queries, not viewport media queries, decide what hides, so split panes behave like phones.

**Non-Goals:**
- No change to the context details panel content, model picker menu, voice route menu or voice panel.
- No new mode indicators; the status row only gets a slot for them (Goal chip comes later).

## Decisions

- **Status row is a flex row inside `composer-input-anchor`.** The mascot moves from `position:absolute; bottom:100%` into the row's right end (still `aria-hidden`); the badge slot is on the left. Alternative: keep the mascot absolute and overlay the badge — rejected, overlaps on narrow widths.
- **Add button is passed into `MessageInput` as a leading slot** (`leading?: ReactNode`), so `MessageInput` stays unaware of menus. The input becomes `display:flex` with the textarea flexing; the send button stays absolutely positioned.
- **Footer becomes two plain flex rows** (`composer-controls`, `composer-metrics`) instead of the grid. The metrics row reuses the existing `composer-usage` button (one control, same `aria-*`), now containing the context percent too. The separate `context-meter` button is removed from the footer; `HoverPanel` is anchored to the metrics button.
- **Compact numbers** come from one helper (`formatCompactTokens`: `<1000` as is, `<10k` one decimal, otherwise integer `k`/`M`). Exact values remain in `aria-label`.
- **Hide order by container queries** on the metrics row: cache hit at ≤ 400px, used/total tokens at ≤ 460px.
- **Voice capsule**: `VoiceEntryControls` renders `VoiceRoutePicker` first, then voice mode, then inline input, wrapped in `.voice-capsule` (pill background). The route picker icon changes from `AudioLines` to `Settings`. Inline input gets `data-primary` with accent fill; its pressed/disabled styles keep contrast. Alternative V2 (text labels) was offered and not chosen.

## Risks / Trade-offs

- [Mascot sizes differ per pet (deepy, whalegirl use scaling)] → keep their per-pet transforms, only change the anchor; verify each pet in Storybook.
- [Tests query the footer by old structure/order] → update `composer-footer`, `composer-usage`, `voice-entry-controls`, `plan-mode-badge` and `mascot` tests in the same task groups.
- [Accent mic button may read as "send"] → it keeps its own icon and label; send stays inside the input.
