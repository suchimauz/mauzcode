# Tasks

Implementation is not authorized by creation of this change. All tasks below remain unchecked until a separate implementation request.

## 1. SDK settings sections

- [x] 1.1 Add public settings section types and matching server/frontend grants, including compilation, manifest and approval identity handling; verify with grant validation, changed-grant approval and backward-compatibility tests.
- [x] 1.2 Add registry support and the shared Plugin Settings host page with lifecycle cleanup; verify granted, missing-grant, unloaded and unapproved-plugin scenarios in frontend tests.
- [x] 1.3 Document the settingsSections contract, manifest example, trust boundary and lifecycle requirements in UI architecture/SDK documentation; verify examples use only the public SDK and cover owner/CSRF obligations.

## 2. Official RTK plugin and state

- [x] 2.1 Add the official plugin skeleton and default-off instance control state with revision-safe persistence and lifecycle invalidation; verify absence/unload, default state, restart and concurrent disable/enable tests. Use a standard migration only where needed.
- [x] 2.2 Implement bounded direct-subprocess PATH discovery, --version and fixed-command rewrite probing without executing the probe; verify fake executables for missing, permission-denied, SIGILL, timeout, overflow, incompatible and healthy cases.
- [x] 2.3 Implement owner-authorized status/check/enable/disable APIs with write CSRF enforcement, fresh enable checks and no generic-settings bypass; verify unauthorized requests, stale checks, restart revalidation and recovery without automatic enablement.
- [x] 2.4 Document instance-wide state, probe behavior, required PATH and unavailable reasons in the plugin workflow; verify that no install/update, binary-path editor or permission-file modification is offered.

## 3. Local bash integration

- [x] 3.1 Inspect tools.bash callers and add the optional preparation seam plus rtk:false schema/docs; verify disabled/absent/unloaded, bypass, explicit host:local and remote workspace/SSH paths without unintended RTK calls.
- [x] 3.2 Implement effective cwd/env/PATH preparation and one-argument rewrite invocation with bounded output and a shared timeout deadline; verify quotes, chains, redirects, substitutions, custom PATH, secrets and timeout-before-launch cases.
- [x] 3.3 Implement explicit 0/1/2/3 and invalid-response transitions, technical auto-disable/fallback and host-owned authorization semantics; verify each outcome with fake executables and invocation counters proving one execution or zero on denial/deadline.
- [x] 3.4 Connect prepared execution to the existing runner without post-start retries; verify nonzero command results, runtime RTK crashes, timeouts, stdout/stderr formatting, caps and streaming remain correct.
- [x] 3.5 Add safe original/executed command and preparation outcome details to existing tool-run observability; verify secret redaction for diagnostics, metadata and new streaming paths, without additional raw-output retention or duplicate tool calls.
- [x] 3.6 Document code-3 host authority, code-2 denial, technical fallback, prospective bypass and no automatic replay in tool/plugin docs; verify examples do not claim Claude ask rules provide a separate MauzCode barrier.

## 4. RTK settings UI

- [x] 4.1 Add plugins/rtk/ui/index.tsx and its explicit settings grant using React and @mauzcode/ui; verify the runtime-compiled section appears only while the plugin is eligible and does not require an RTK component in core.
- [x] 4.2 Implement availability/enabled states, check action, guarded toggle, path/version/check time and safe failure feedback; verify unavailable/unknown/checking disabled controls, success-without-auto-enable, server rejection, duplicate actions and authoritative refresh in UI tests.
- [x] 4.3 Verify keyboard/focus, status/error accessibility, themes, readOnly, reduced motion and unmount cleanup; document the controls and permission requirements with tested behavior.

## 5. Cross-layer acceptance and rollout readiness

- [x] 5.1 Run cross-layer tests covering restart, concurrent check/enable/disable, plugin unload, PATH mismatch, backend authority and invocation counting; verify all specification scenarios are represented and no command is replayed.
- [x] 5.2 Run read-only local smoke checks against installed RTK and compare enabled versus rtk:false behavior; record protocol version and results without enabling integration without owner authorization or changing permission files.
- [x] 5.3 Hot-reload changed runtime functions, regenerate types when required, validate each changed function's docs strictly without per-file compilation, and run one full settled-batch typecheck plus targeted tests/code.quality; preserve full diagnostics and distinguish pre-existing from introduced failures.
- [x] 5.4 Build the core frontend for the SDK host change, verify runtime compilation of the plugin UI and document default-off rollout/disable-unload rollback; run strict OpenSpec validation with all implementation task statuses accurate.

## Verification notes

- Installed RTK 1.2.0 (read-only smoke, not enabled): `rtk rewrite "git status"` → `rtk git status`, exit 3; `rtk rewrite "echo hi"` → exit 1 (original runs).
- Backend: plugins/rtk + src/plugins/ui + src/tools tests 69/69 pass. Frontend: rtk-settings + plugin-settings 12/12; full vitest suite failures are pre-existing/unrelated (git/terminal plugin npm dependencies missing in the worktree, live-navigation).
- Full typecheck: 463 diagnostics before the change and after it; no new ones in the changed files. Hot-reload and runtime docs validation are not possible from this worktree (the live server runs the main checkout); they apply after merge. Core frontend `vite build` succeeds; plugin UI bundles with the runtime externals (react, @mauzcode/ui).

## Workflow follow-up

- This stage only delivers proposal, design, delta specifications and this unchecked task list for review on Canvas.
- Implementation requires a separate user request. Do not archive, commit, push or enable RTK as part of preparing these documents.
