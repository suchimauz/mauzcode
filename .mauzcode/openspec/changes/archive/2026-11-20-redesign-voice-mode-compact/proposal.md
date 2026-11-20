# Proposal

## Why

The dedicated voice mode is too heavy. On desktop, the voice panel still shows the composer footer (model, context meter, voice entry controls), a separate inline voice error line, transient notices and the "stop execution" button under it. Inside the panel there are four wide text buttons with shortcut hints. On mobile the same four 44 px buttons wrap into two or three rows, so voice mode takes about half of the screen. The user reviewed mockups and approved a compact layout for both form factors.

## What Changes

- Desktop voice mode becomes one compact row: a live waveform as the recording indicator, the transcript (up to about four lines, scrollable), the remaining time, and four icon buttons: clear dictation, pause/resume, send (accent), exit. A single thin hint line under the row shows the shortcuts (Space — pause, Enter — send, Esc — exit). Approved mockup: `mockups/desktop.html`, "Предлагается" frame.
- Mobile voice mode (coarse pointer or narrow composer) uses layout "C4 + D5 + E1" from `mockups/mobile.html`:
  - the transcript spans the full width; a clear-dictation button (⌫ in a soft grey circle) sits in the top-right corner of the transcript and is hidden when there is nothing to clear;
  - one row under it: exit (✕) on the left, waveform and remaining time, then pause/resume and send on the right; all buttons are 44 px circles; no shortcut hints;
  - pause/resume is filled with the accent colour while recording and turns neutral on pause or error; send is the neutral dark (inverted) button.
- While voice mode is open, nothing is rendered below the panel: the composer footer, the inline voice error line, transient composer notices and the "stop execution" button are hidden. Errors that matter to voice mode (capture errors, send failures) are shown in one error line inside the panel; the panel border turns to the danger colour in the error state.
- State text ("Идёт запись", "Пауза", "Ошибка") is no longer a visible heading; it stays available to assistive technology and is conveyed visually by the waveform, the pause/resume icon and the time label.
- Behaviour does not change: the same draft, shortcuts, explicit send, clear semantics, capture isolation and screen-reader announcements remain.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `chat-voice-dictation`: the "Dedicated voice panel" requirement gains layout rules for desktop and mobile, the clear control visibility rule, and the rule that nothing else of the composer is shown under the panel; errors move into the panel.

## Impact

- Frontend only: `frontend/src/components/mauzcode/VoicePanel.tsx`, `voice-panel.css`, `LiveComposer.tsx` (what is rendered while the panel is open), and `frontend/src/test/voice-panel.test.tsx` plus related composer tests.
- No server, provider or API changes. No new dependencies (icons come from the existing `lucide-react`).
