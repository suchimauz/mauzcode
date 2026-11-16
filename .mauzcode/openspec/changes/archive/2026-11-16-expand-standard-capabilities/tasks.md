## 1. Implementation gate and verification

- [x] 1.1 Obtain separate approval to implement; this change currently authorizes artifact preparation only.
- [x] 1.2 Inspect applicable instructions, preset migration conventions, runtime authoring requirements and affected function sources/callers.
- [x] 1.3 Verify official/user glab duplicate handling in both supported discovery paths and identify the explicit root-selection mechanism.

## 2. Standard defaults and upgrade

- [x] 2.1 Add the seven explicit plugin grants and projects.list/projects.get; update the Standard description without widening unrelated grants.
- [x] 2.2 Implement an idempotent upgrade for recognized untouched factory Standard definitions, preserving customized fields and all agent snapshots.
- [x] 2.3 Update preset documentation and discovery/prompt assertions; retain existing planning/input behavior and Creator/Minimal defaults.

## 3. Official GitLab integration

- [x] 3.1 Add plugins/glab manifest, workflow documentation, read implementation and isolated tests from the reviewed user-local package.
- [x] 3.2 Preserve the public ID/API, fixed GET resources, explicit host, pagination, credential isolation, bounded execution and safe errors.
- [x] 3.3 Ensure clean-install discovery without USER_PLUGINS and explicit duplicate selection or actionable conflict without silent implementation mixing.
- [x] 3.4 Document CLI/auth prerequisites and the separately approved procedure for choosing the official root; do not delete user files or alter the live registry automatically.

## 4. Acceptance coverage

- [x] 4.1 Test exact Standard grants, reset/new-agent creation, unchanged existing snapshots and unchanged Creator/Minimal behavior.
- [x] 4.2 Test factory upgrade, customized-definition preservation, repeated upgrade and absence of boot overwrites.
- [x] 4.3 Test deny precedence, child intersections, filtered discovery and continued planning/input availability.
- [x] 4.4 Test official glab discovery and duplicate-root behavior using isolated directories.
- [x] 4.5 Run mock CLI tests for valid resources, invalid hosts/arguments, forbidden endpoints, host/token environment isolation, pagination, timeouts, output clipping and secret-safe errors; do not contact real accounts.
- [x] 4.6 Verify that grants do not bypass confirmation paths, Plan mode or prerequisite failures.

## 5. Final verification and delivery

Verification notes: implementation explicitly requested by the user. Final targeted suite: 102 passing tests, 1,029 assertions; full project `tsc --noEmit --pretty false` and `git diff --check` pass. Logs are in the implementing agent's `.mauzcode/tmp/pa/`. `code.quality({})` initially detected the official/user-local glab ambiguity. After separate explicit human confirmation, the redundant user-local glab directory was removed; the official package was preserved. The subsequent quality check passed (`ok: true`, 0 errors, 544 warnings). No registry, authentication or database changes or server restarts were made. Plan-mode approval behavior is covered by the existing planning unit suite; expanded grants do not change that policy.

- [x] 5.1 Run targeted tests and one full-project typecheck on the settled implementation batch; preserve diagnostics and distinguish pre-existing failures.
- [x] 5.2 Run code quality checks, investigate failures and revalidate the OpenSpec change strictly.
- [x] 5.3 Review the final diff for unintended snapshot, registry, user-plugin, settings or credential changes and report results without publishing or restarting services.
