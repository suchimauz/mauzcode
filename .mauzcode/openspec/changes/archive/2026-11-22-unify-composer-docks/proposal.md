# Proposal

## Why

The panels stacked above the chat composer — todos, triggers, goal and the message queue — share one card shell but each draws its own header, disclosure, badges, rows and notices. The result reads as four different widgets: chevrons point and sit differently, the goal has no header button, the queue hides its header for a single message, badges and error notices use different shapes, and expanded bodies have different dividers and heights. A shared, specified dock anatomy makes the stack look like one surface and keeps future docks consistent.

## What Changes

- Define one dock anatomy for every composer dock: a header row (leading icon, disclosure chevron, title/summary, trailing meta and actions), an optional expanded body, and an optional notice line.
- Unify the disclosure: same chevron icon, size, position (after the leading icon) and direction (right when collapsed, down when expanded) in all docks; the header is one button with `aria-expanded`/`aria-controls`, trailing action buttons are siblings of it.
- Unify leading icons (one size and color), header typography, trailing meta (counters, status text, status dot) and pill badges (one radius, border and text style for todo "Paused" and trigger kind counts).
- Unify rows inside the expanded body: same minimum height, padding, hairline separators, marker alignment, secondary-line style and scroll cap.
- Unify notices: errors and informational notices use one style with an inline text-button action.
- Goal dock gets the same header button structure as the others; the message queue keeps its header visible with one message, in the same compact form.
- Keep stacking rules (joined cards, expanded dock stands apart), light/dark tokens, focus rings, reduced motion and every existing control, label and behavior unchanged.

## Capabilities

### New Capabilities
- `chat-composer-docks`: shared visual and interaction anatomy of the panels stacked above the chat composer (header, disclosure, badges, rows, notices, stacking).

### Modified Capabilities
<!-- None: todo, trigger, goal and queue behavior requirements stay as specified; only presentation is unified. -->

## Impact

- Frontend only: `frontend/src/components/mauzcode/{TodoDock,TriggerDock,GoalDock,QueueDock}.tsx`, their CSS (`queue-dock.css`, `todo-dock.css`, `trigger-dock.css`, `goal-dock.css`) and the composer stacking rules in `frontend/src/styles/questions.css`.
- Possibly a small shared dock header/badge component under `components/mauzcode/`.
- Tests: `frontend/src/test/{todo-dock,trigger-dock,goal-dock,goal-removal,message-queue}.test.tsx` updated for the common structure.
- No API, server or data changes.
