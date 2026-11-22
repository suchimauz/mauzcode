## 1. Shared primitives

- [ ] 1.1 Add `ComposerDock` primitives (`Dock`, `DockHeader` with disclosure button, static variant and sibling actions slot, `DockBadge`, `DockNotice`) and `composer-dock.css` with `dock-*` classes for shell, stacking, header, meta, badge, body rows, `--dock-body-max` scroll cap and notice; 44px header under `pointer: coarse`
- [ ] 1.2 Move the stacking rules from `queue-dock.css` to `composer-dock.css`, keyed on the shell's `data-expanded` instead of any nested `aria-expanded`; in `styles/questions.css` update selectors and replace the `.queue-list` caps with `--dock-body-max` overrides

## 2. Migrate docks

- [ ] 2.1 TodoDock: use the primitives; "Paused" as `DockBadge`; keep markers, details and labels; update `todo-dock.test.tsx`
- [ ] 2.2 TriggerDock: use the primitives; kind counts as `DockBadge`; notice via `DockNotice`; update `trigger-dock.test.tsx`
- [ ] 2.3 GoalDock: header disclosure button; status dot as a sibling in the actions area referenced via `aria-describedby`; edit (expands the dock) and pause/resume (does not toggle) as sibling actions; details, form, removal and error via shared body/notice; update `goal-dock.test.tsx` and `goal-removal.test.tsx`
- [ ] 2.4 QueueDock: header always shown; with one message a static header without chevron and without `data-expanded`; with several, `ChevronRight`/`ChevronDown` after the icon and forced expansion shown as disabled disclosure; error via `DockNotice`; update `message-queue.test.tsx`
- [ ] 2.5 Remove dead `queue-*`/per-dock shell CSS, keep only content-specific rules

## 3. Verify

- [ ] 3.1 Run the frontend tests and typecheck
- [ ] 3.2 Visually check all four docks together, collapsed and expanded, in light and dark themes, narrow width, coarse pointer, reduced motion, and with a question card stacked above (including a low viewport); queue with one and with several messages; confirm no control or accessible name was lost
