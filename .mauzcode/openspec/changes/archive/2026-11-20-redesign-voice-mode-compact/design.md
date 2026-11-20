# Design

## Context

`VoicePanel` renders a status row (dot, state label, remaining time), an optional error paragraph, attachments, the transcript and four text buttons with `<kbd>` hints. `LiveComposer` renders it in place of `MessageInput`, but still renders `ComposerFooter`, the inline voice error line, `notice`, `error` and the stop-execution button after it. The approved mockups are in `mockups/desktop.html` (frame "Предлагается") and `mockups/mobile.html` (variant E1, which includes C4 layout and D5 colours).

## Goals / Non-Goals

**Goals:** a compact panel on both form factors; nothing of the composer below the panel; errors inside the panel; behaviour and accessibility contracts unchanged.

**Non-Goals:** changing capture, send, clear or shortcut semantics; changing inline dictation; changing the voice entry controls in the footer when voice mode is closed; an undo for clear.

## Decisions

1. **One component, two layouts via CSS.** `VoicePanel` keeps one DOM: transcript wrapper (with the clear button positioned inside it), a control row (exit, waveform, time, spacer, pause/resume, send) and the hint line. Desktop is selected by `@container (min-width: 520px)` on the composer anchor combined with `@media (pointer: fine)`; it lays the transcript and controls in one row and moves clear next to pause. Otherwise the mobile layout applies. Alternative: two components picked by a JS media query; rejected because it duplicates focus and keyboard logic and flickers on resize.
2. **Icons from `lucide-react`.** `Delete` (⌫ shape) for clear, `Pause`/`Play`/`RotateCcw` (error: resume) for the toggle, `Send`, `X`. Every icon button gets `aria-label` and `title`; shortcuts stay in `aria-keyshortcuts`. The visually hidden key description (`${id}-keys`) stays.
3. **Waveform instead of a state heading.** Five bars animated with CSS only while `data-state=listening`; static and neutral in other states; `prefers-reduced-motion` disables the animation. The state label becomes `sr-only` and is still the panel's `aria-describedby` target; the live region and its rules are unchanged.
4. **Clear visibility.** Mobile: `hidden` when `canClear` is false (nothing to activate, so not focusable). Desktop: keep the current `aria-disabled` + `title` behaviour so keyboard users hear why. Both use the existing `onClear` / `canClear`.
5. **Colours (D5).** Pause/resume uses `--accent` / `--on-accent` while `listening` on mobile; neutral otherwise. Send is the primary (dark/inverted) button on mobile and the accent button on desktop as in the approved desktop mockup. Error state sets the panel border to `--danger`.
6. **Nothing below the panel.** In `LiveComposer`, when `panel.open`: do not render `ComposerFooter`, the inline voice error line, `notice` or the stop-execution button. The composer `error` (send failure) is passed to `VoicePanel` as a new `sendError?: string` prop and rendered in the panel's single error line; a capture error wins if both exist. The footer is unmounted, not hidden, so its 30 s context polling pauses; it remounts on exit and refetches.
7. **Exit while the footer is gone.** The voice-mode footer button was one of the two ways to leave; the panel's exit button and Escape remain, which satisfies "each operation has a labeled control".

## Risks / Trade-offs

- Hiding the footer hides the model picker and context meter during voice mode → acceptable by request; they return on exit.
- Unmounting the footer drops the route picker state → it already re-reads settings on mount.
- Container query support → supported by all target browsers already used in `composer-footer.css`.

## Migration Plan

Frontend-only; ship in one change. Rollback is a revert.

## Open Questions

_None._ All layout choices were approved on the mockups.
