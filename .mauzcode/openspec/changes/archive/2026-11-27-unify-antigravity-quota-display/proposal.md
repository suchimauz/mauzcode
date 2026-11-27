# Proposal

## Why

Antigravity quota is now read correctly as separate five-hour and weekly limits for the Gemini and Claude/GPT pools, but it is rendered by its own family-specific cards, tooltips, labels and Settings section. Every other provider (Claude, Codex, OpenCode Go, Z.ai, MiniMax) uses one shared quota presentation, so Antigravity looks and reads differently ("5 hours · использовано", "Claude/GPT limits", a highlighted section) and keeps a second rendering path to maintain.

## What Changes

- **BREAKING (internal API shape)**: `/api/v1/quotas` returns one ordinary quota account per eligible Antigravity family pool (Gemini, Claude/GPT) of a connection instead of one account with `families` and family readings in `additionalWindows`. Each record fills the standard `windows` map (five-hour, weekly, monthly) and names its family.
- The sidebar shows these records with the standard quota card, tooltip and compact-rail row. The card's second line keeps the current `Gemini · <account>` / `Claude · <account>` caption; everything else (icon, `+N` indicator, `5ч · Нед. · Мес.` cells, tones, tooltip text) is the shared one.
- Settings keeps two sections, Gemini and Claude/GPT, for an Antigravity connection, but each renders the same window list as other providers, with standard period names and the shared `N% used · resets …` format; no pool caption and no persistent highlight.
- Remove the family-specific card, tooltip, summary helpers and family texts from the frontend.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `model-defaults-and-pricing`: Antigravity quota is projected as per-family ordinary accounts with standard windows; sidebar uses the standard card with a family caption; tooltip rule no longer has an Antigravity exception.
- `models-settings-ui`: Antigravity connection usage shows per-family sections rendered with the shared window list and period names.

## Impact

- Backend: `src/api/$route_v1_quotas_GET.ts` (account projection), Antigravity usage window labels (`src/models/provider/antigravity/mapUsage.ts`).
- Frontend: `frontend/src/lib/quotas.ts`, `frontend/src/components/mauzcode/QuotaMatrix.tsx`, `frontend/src/components/settings/ModelsPanel.tsx`, related CSS and tests (`quota-*.test.ts(x)`, `settings-models.test.tsx`, `use-quotas.test.tsx`, stories/fixtures).
- No change to how quota is read, refreshed or cached; other providers' output is unchanged.
