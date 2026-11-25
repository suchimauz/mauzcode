# Tasks

## 1. Claude wire budget

- [x] 1.1 Select automatic budgets by model and preserve explicit limits; verify request bodies for the catalogue, an unknown model and a caller override in mocked transport tests.
- [x] 1.2 Negotiate rejected automatic budgets without replaying unrelated failures; test the decreasing sequence, exhaustion, unchanged payload, caller overrides and non-budget failures.

## 2. Claude agent continuation

- [x] 2.1 Allow at most two shorter-response retries after consecutive Claude no-tool length stops; test successful continuation and the terminal third cutoff.
- [x] 2.2 Preserve tool safety and provider isolation; test that valid-looking truncated calls are not dispatched and non-Claude behavior remains unchanged.

## Workflow follow-up

- Commit the verified implementation, archive this change, validate all specs, and commit the archive separately with approval.
