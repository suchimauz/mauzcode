# Design

## Context

See proposal.md for motivation and scope. Current `src/tools/bash.ts` resolves secret references, selects local or remote workspace execution, calls `agent.executeBash` locally or `remote.exec` remotely, and redacts final output. `agent.executeBash` owns local process streaming and execution behavior. The integration belongs at local bash preparation, not at every subprocess or tool invocation.

The public SDK currently exposes pages, panels, canvas/input contributions, model provider forms and chat cards, but no general settings contribution; the Settings tab list is a fixed core array. Server-side `UiGrants`, `uiCompile` and `uiManifest` participate in bundle eligibility; a frontend-only type addition would be incomplete.

RTK 1.2.0 is installed from source without the optional engine. Its `rewrite --help` and source distinguish exits 0, 1, 2 and 3. Exit 3 includes both explicit ask rules and the absence of covering allow rules: it is not a generic error. A downloaded binary previously failed with Illegal instruction, so filesystem presence is demonstrably insufficient as a health check.

The instance has existing OpenSpec changes unrelated to this proposal. This stage writes documents only and leaves every implementation task unchecked.

## Goals / Non-Goals

**Goals:** isolate RTK behavior in an official optional plugin; keep core integration narrow; make guarded state transitions and command execution deterministic; offer reusable SDK settings hosting; retain one execution per call and secret-safe diagnostics.

**Non-goals:** generic middleware chains; plugin overrides of core tools; remote RTK; Terminal interception; compression of SQL/files/plugin responses; installers/updaters; rewriting Claude/Codex configuration; additional confirmation flows for code 3; raw-output replay or analytics.

## Decisions

### 1. Official plugin and a narrow preparation seam

Implement RTK procedures and UI under `plugins/rtk`, using normal plugin loading and unload eligibility. Core `tools.bash` has one optional preparation call for local targets, gated by plugin availability and per-call bypass. The integration is inert when the plugin is absent, unloaded or disabled. Do not put substantive logic in private USER_PLUGINS or override `tools.bash` through another function root.

The preparation outcome has three explicit variants: execute (original or rewritten command, remaining time and safe metadata), deny (safe diagnostic, no execution), or deadline exhausted (no execution). Technical fallback is resolved before returning execute and records a disabled state. This prevents an ambiguous exception handler from rerunning a command after it starts.

Alternatives rejected: replacing the core tool from the plugin creates lifecycle/signature ambiguity; intercepting `agent.executeBash` catches internal commands outside the agreed scope; a general hook chain adds unnecessary ordering and security contracts.

### 2. Generic SDK settings tabs with explicit grants

Add `settingsTabs` contributions shaped like named titled views, a matching `procs.ui.settingsTabs` allowlist and public exported types. Extend frontend types/registry/installed Settings pages/plugin runtime and server `UiGrants`, `uiCompile`, `uiManifest`, grant equality/approval identity and fixtures. Each eligible registered tab becomes its own entry in the Settings navigation after the built-in tabs, titled by the plugin and drawn with the plugin's `procs.icon` (validated Phosphor class, puzzle fallback, no plugin markup or URLs); the host renders the heading/description and isolates errors with the existing extension boundary.

RTK's UI remains in `plugins/rtk/ui/index.tsx`; it imports React and the public SDK, not core-private components. Non-official plugin approval remains mandatory. Missing grants hide/reject ungranted contributions consistently with existing registry behavior. On lifecycle updates remove stale tabs and clean up their resources; an open tab that disappears shows an unavailable state.

Alternatives rejected: a hardcoded RTK settings component in core would not satisfy plugin declaration; reusing model-provider forms would conflate unrelated contracts; a standalone plugin page would not meet the requested settings integration; a shared catch-all "Plugins" tab (first implementation) hid plugin settings behind a generic entry and was replaced by per-plugin tabs at the user's request.

### 3. Owner-controlled instance state, not a freely writable boolean

Keep an instance-scoped durable control record with enabled state, latest safe availability result, check time and a monotonic revision. The plugin owns the persistence adapter through the existing framework database layer. Introduce a migration only if the implementation requires a dedicated record; do not repurpose unrelated agent/session state. Enable/check/disable endpoints authenticate the owner and enforce existing cookie-bound CSRF for mutations. GET status must not silently enable anything.

Use revision-checked transitions: enable snapshots the revision, performs a fresh bounded check, and commits only if the revision and plugin lifecycle are still current. Disable invalidates in-flight enablement. A technical failure disables the integration and invalidates stale success. Serialize or revision-order concurrent checks so stale results cannot overwrite newer state. An ordinary generic settings write must not switch enabled on without this contract; do not expose an unchecked writable enable boolean there.

Persisted enabled state is intent, not proof of health. Revalidate before first use after restart and perform a short preflight before each eligible call. A successful check updates availability only; recovery never silently re-enables. Unload invalidates active preparation generations, and calls that have not launched must re-check eligibility before launch. Already launched commands are never replayed.

### 4. Availability and subprocess context

The owner-facing check searches the server PATH and runs the resolved executable with `--version`, followed by `rewrite` on a fixed safe command such as `git status`, without executing the returned command. Use direct argv subprocess spawning, not `tools.bash`, to avoid recursion and shell expansion. Report path/version/time and distinguish missing binary, permissions, signal/SIGILL, timeout and protocol incompatibility.

For command preparation, resolve the same effective local cwd/environment used by execution (including `opts.env` and resolved secrets). Use the executable resolved for that environment; the emitted command must be able to find that executable in the same environment. Do not silently substitute another PATH or pretend to be another agent with `RTK_REWRITE_HOST`. No configurable binary path is introduced in this version.

Use a small fixed internal preparation limit (initial target: five seconds total for health check and rewrite, 64 KiB combined captured output), bounded further by the remaining caller deadline. Limits can be tuned through tests without changing the behavioral contract. Kill/reap a timed-out preparation process. Overflow is an error, never executable truncated text. Count preparation against a supplied timeout in seconds; use one deadline to calculate the remaining execution budget. If it is exhausted, return timeout rather than executing fallback.

RTK 1.2.0 provides the initial compatibility fixture. Verify actual protocol behavior instead of accepting a version string alone. A policy refusal from a health probe is not proof the binary crashed; report a safe failed check when rewrite capability cannot be demonstrated without altering policy. For actual commands, code 2 is always a denial, never a technical fallback.

#### Implementation decisions (blocks 1–2)

- Persistence: a dedicated single-row table `rtk_control` (id = 1) created by the plugin migration, with `enabled`, `revision`, `availability` (`unknown` | `available` | `unavailable`), `path`, `version`, `reason`, `checked_at`, `updated_at`. A missing row reads as disabled/unknown.
- Probe failure codes: `missing`, `permission`, `signal` (SIGILL named explicitly), `timeout`, `overflow` (output cap exceeded, never trusted), `spawn`, `incompatible` (unrecognized `--version` or rewrite response) and `policy` (rewrite of the read-only probe exits 1/2: capability not demonstrated under current RTK policy, reported as a failed check rather than a crash). Healthy rewrite: exit 0 or 3 with one nonempty line containing `rtk`.
- Probe budget: one 5-second deadline shared by `--version` and `rewrite`; each step's output is capped at 4 KiB. On timeout or overflow the process is killed and pipe reads are cancelled, so descendants holding the pipe cannot stall the check.
- Lifecycle: in-process `generation` (bumped by plugin start/stop) and `verifiedRevision` (cleared on start/stop/disable) live in `ctx.state.rtk`; check/enable/revalidate are serialized in-process, disable is not queued so it can invalidate an in-flight enable.
- HTTP: `GET /rtk/api` returns state and the cookie-bound CSRF token without probing; `POST /rtk/api` accepts only `{ action: "check" | "enable" | "disable" }` (owner, same origin, `x-csrf-token`, JSON ≤ 1 KiB); failed enable returns 409 with the current state.
- Settings host: tabs are keyed `<plugin>/<id>`, selected as Settings tab `plugin:<plugin>/<id>` (also accepted in `?settings=`), use the surface-id grammar for ids and receive `{ context }` with `agentId: null`. There is no shared "Plugins" settings tab.

### 5. Single-command rewrite protocol

Invoke `[resolvedRtk, 'rewrite', originalCommand]`, with the complete original command as one argument. Do not parse shell syntax ourselves, wrap arbitrary scripts blindly, or expand substitutions before rewrite. Validate that a proposed command is nonempty and contains no invalid transport/NUL data; do not claim to semantically validate arbitrary shell code.

| Rewrite outcome | Action | Enabled state |
| --- | --- | --- |
| 0 or 3, valid nonempty command | Execute replacement once under MauzCode authority | Unchanged |
| 1, no replacement | Execute original once | Unchanged |
| 2, with or without diagnostic | Return denial; execute nothing | Not classified as technical failure |
| Spawn failure, signal, timeout, overflow, unknown code or invalid response | Disable, record safe reason, execute original once if time remains | Disabled |

An identical replacement is valid and does not recurse. Do not override RTK's own support decisions for chains, quotes, redirects or substitutions. `rtk:false` bypasses all automatic check/rewrite work for that call and cannot force-enable the integration; a command explicitly containing RTK is still executed as written.

The user explicitly selected host-owned permission decisions: code 3 does not add an approval card, and Claude Code ask rules are not independent MauzCode barriers. Document this prominently. Code 0 also is not an authorization grant. Existing action-specific approvals remain required, and original/executed commands remain inspectable. No RTK-specific permission config is written.

### 6. Preserve execution and expose safe metadata

Once preparation selects a command, invoke the existing local execution path exactly once. A runtime error, timeout or RTK crash after launch returns normally as an error result, never triggering another execution. A nonzero user command is not sufficient evidence to disable RTK.

Keep remote behavior unchanged. Preserve local stdout/stderr formatting, cap behavior, streaming and secret handling; add only a brief technical-disablement notice when fallback occurs. Record original and executed command plus preparation outcome in existing tool-run details rather than manufacturing a second tool call. Resolve and mask secrets before publishing any new metadata, diagnostic or stream event. Do not persist extra unredacted raw output for integration analytics.

Bypass is prospective. There is no guarantee of recovering the complete output of a previous run; rerunning a command requires a separate decision and is not automatic recovery.

### 7. UI states and accessibility

Render a settings tab with the local-bash toggle, Check RTK button, availability status, independent enabled state, path/version/check time and failure text. Disable enabling while availability is unknown, checking or unavailable; backend always checks again. Disallow duplicate submissions and refresh authoritative state after actions. Respect readOnly, owner access, semantic themes, focus, accessible status/error announcements and reduced motion using existing SDK components.

If live updates are used, declare the topic, supply resync/onError and clean up subscriptions. Polling or fetching must also abort on unmount. Do not add dependency installation, savings charts or configuration editors.

## Implementation Notes (block 3)

- Seam: `tools.bash` calls the optional `rtk.prepare` (absent/unloaded plugin or `rtk:false` → unchanged behavior; an exception inside it → original once with a notice). Remote branch is untouched.
- `rtk` is resolved on the call's effective PATH; a different or missing executable skips RTK for that call (notice) instead of switching binaries or disabling.
- Revalidation after restart uses the remaining caller budget; a probe timeout caused only by a shortened budget returns `expired` and does not disable RTK.
- Disable or plugin reload during the rewrite yields outcome `stale`: the original runs once, the replacement is not used. A user stop observed before launch starts nothing.
- Safe details (`outcome`, `original`, `executed`, `code`, `notice`, `diagnostic`, secrets masked) travel as `details.rtk` through `tools.call` into the tool-call event and are shown in the bash tool details; no raw RTK output is stored.

## Risks / Trade-offs

- Per-call preflight adds latency → short bounded subprocesses; no full test/build or user-command execution in probes.
- RTK policy and protocol evolve → protocol fixtures for 1.2.0, bounded invalid-response fallback, explicit documentation of code 3.
- PATH changes or binary replacement race with execution → use consistent effective context and re-check eligibility; after launch never retry, even on executable failure.
- Global disable after a per-call environment failure affects all local agents → intentional instance-wide safety behavior, visible reason and explicit re-enable.
- Compression can omit useful details → `rtk:false` gives prospective unfiltered execution; never promise lossless filtering.
- A broad SDK change can accidentally bypass approval → server/frontend grant and identity tests, including unchanged old plugins and unapproved bundles.
- Resolved secrets can appear in rewrite diagnostics → redact all new visible/persisted fields and test with fake executables; do not treat the UI as a security boundary.

## Migration Plan

This documentation stage creates only the change artifacts and runs strict OpenSpec validation. No plugin is installed/enabled and no runtime code is edited.

After separate implementation authorization: land SDK support and its tests; add the default-off official plugin and guarded state; integrate the local preparation seam and metadata; build the core frontend and use the normal runtime plugin UI build. Add only necessary persistence migration through the standard migration mechanism. Hot-reload runtime changes and regenerate types for added/removed files. Validate changed runtime metadata and run one full settled-batch typecheck, recording pre-existing diagnostics separately.

Run deterministic fake-executable tests plus read-only smoke checks on installed RTK. Roll out disabled and require owner check/enable. Rollback is first disabling the integration, then unloading the plugin if needed; no shell profiles or external agent hooks need restoration. No commit, push, change archive or activation is authorized by this documentation-stage approval.
