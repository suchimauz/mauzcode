# Tasks

## 1. Quota API projection

- [x] 1.1 In `src/api/$route_v1_quotas_GET.ts` project each eligible Antigravity family into its own quota account (`<connection>:<family>`, `family`, standard `windows`, own `additionalWindows`, unassigned buckets kept on the first pool account), drop `families`; verify with route tests for two pools, one ineligible pool, no eligible pool (status account), extra bucket, alert tone and unchanged Claude/Codex accounts.
- [x] 1.2 Give Antigravity general windows the shared labels `Session (5h)` / `Weekly (7d)` in `mapUsage.ts`; verify with the Antigravity usage tests and fixture `antigravity-quota-account.json`.

## 2. Sidebar on the standard card

- [x] 2.1 Add `family` to `QuotaAccount`, make `quotaAccountCaption` return `<Family> · <account>` for it and pass `{ account: connectionId, family }` on click; remove `FamilyCard`, `FamilyTooltipBody`, family summary helpers, family texts and CSS; verify `quota-matrix`, `quota-family-summary` (rewritten or removed) and `quota-antigravity-acceptance` tests show standard cards, tooltip and compact rows with `Gemini · <account>` captions.
- [x] 2.2 Update stories and Chrome fixtures (`WorkspaceSidebar.stories.tsx`, `test/chrome/react-surfaces.fixture.tsx`) to the new account shape; verify the frontend typecheck passes.

## 3. Settings on the standard window list

- [x] 3.1 In `ModelsPanel.tsx` render family windows as titled sections using the generic window list and standard summary wording; remove `FamilyUsage`, `usageFamilies`, the pool caption and persistent `data-selected` outline, keep scroll+focus on target; verify `settings-models.test.tsx` for two sections, unknown value and opening from a sidebar card.

## 4. Integration

- [x] 4.1 Run the frontend test suite, the quota/Antigravity backend tests and the project typecheck once; check in the browser that Antigravity cards and Settings match a Claude connection's presentation.
