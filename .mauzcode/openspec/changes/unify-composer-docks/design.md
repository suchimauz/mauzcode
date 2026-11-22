# Design

## Context

Four docks render above the message input in `LiveComposer`: `TodoDock`, `TriggerDock`, `GoalDock`, `QueueDock`. All use the `.queue-dock` shell from `queue-dock.css`, but:

- Todo and trigger use a `.queue-header` button with `ChevronRight`/`ChevronDown` after the icon; the queue uses `ChevronDown`/`ChevronUp` at the end and hides the header for one message; the goal has no header button, only a `.goal-summary` button inside a `.queue-row`, with actions next to it.
- Badges: `.todo-paused` (6px radius) vs `.trigger-count` (999px radius).
- Notices: `.queue-error` vs `.trigger-notice`, different padding and roles.
- Body separators and scroll caps differ (`.todo-body`, `.trigger-list` 220px/30vh, `.queue-list` 180px).
- `questions.css` overrides dock radii when a question card is stacked.

UI work follows `docs/skills/apple-design/SKILL.md`, existing tokens and accessible components.

## Goals / Non-Goals

**Goals:** one header/disclosure/badge/row/notice vocabulary; identical alignment and sizes; no behavior or label changes.

**Non-Goals:** new dock features, changing what each dock shows, changing data loading or live refresh, redesigning the composer or question card.

## Decisions

- **Shared primitives, not a framework.** Add a small `ComposerDock` module (`Dock`, `DockHeader`, `DockBadge`, `DockNotice`) under `components/mauzcode/` and a `composer-dock.css` with neutral `dock-*` classes. Docks keep their own state and content; they only compose the primitives. Alternative — keeping per-dock CSS aligned by convention — was rejected because drift is the current problem.
- **Header structure.** `DockHeader` renders `<div class="dock-header">` containing the disclosure `<button>` (icon, chevron, summary, meta) and a sibling `.dock-actions` slot. This lets the goal keep its pause/edit buttons in the header without nesting buttons. Status indicators with their own live region (goal status dot) go into `.dock-actions`, before the buttons, and the disclosure button points to them with `aria-describedby`, so the button name stays the summary. Header height is 36px, 44px under `pointer: coarse`. `DockHeader` also has a static variant (no button, no chevron) for always-open bodies.
- **Chevron.** `ChevronRight` collapsed / `ChevronDown` expanded, 14px, after the 16px leading icon, in every dock (queue switches from Down/Up at the end).
- **Queue with one message.** Always render the header ("В очереди: 1") in the static variant: the body is always visible, as today, so there is nothing to toggle. The dock is not marked expanded, so it joins the stack like a collapsed dock instead of becoming a separate tinted card.
- **Goal edit.** The edit button expands the dock to show the form (allowed by the spec); pause/resume never changes the expanded state.
- **Tokens.** One badge style (999px pill, .5px `--line` border, 12px/20px), one meta style (12px, `--text-caption`, tabular nums), one notice style (12px/18px, `--text-secondary`, hairline top), one body scroll cap (`--dock-body-max: min(220px, 30vh)`). `questions.css` overrides that variable on `.question-composer-stack.has-question` (`min(15dvh, 120px)`, `10dvh` at `max-height: 650px`), replacing today's queue-only `.queue-list` rule.
- **Class migration.** Replace `queue-*` shell classes with `dock-*` and update `questions.css` selectors; keep dock-specific classes only for content (todo marker, trigger meta, goal status dot, queue files/editor).

## Risks / Trade-offs

- Tests query by class names → update them to roles/labels where possible.
- Today's `:has([aria-expanded="true"])` stacking rules also match nested disclosures (todo details, trigger rows). Replace them with an explicit `data-expanded` on the `Dock` shell, set by the dock only for disclosure expansion (person or forced); the static queue header never sets it.
- Visible change for the queue (header for one message) → small, consistent with the spec.

## Migration Plan

Frontend-only; ship in one change, verify visually in light/dark and on a narrow viewport. Rollback is reverting the commit.
