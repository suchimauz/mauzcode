# Local OpenSpec CLI workflow

## Purpose

Describe how callers run the bundled CLI against a local workspace, which requests the wrapper refuses, and what callers receive after the process exits.

<!-- Last verified: d35de7c2, 2026-11-22 (static inspection) -->
<!-- sources: plugins/openspec/src/openspec/run.ts, plugins/openspec/src/openspec/validateAll.ts, plugins/openspec/src/openspec/openspec.test.ts -->

## Requirements

### Requirement: Local workspace selection

The wrapper SHALL run the bundled CLI from `.mauzcode` inside an existing absolute local workspace and report its `openspec` subdirectory as the root.

#### Scenario: Explicit local directory
- **WHEN** a caller supplies an existing absolute local directory instead of relying on the session workspace
- **THEN** the wrapper creates its `.mauzcode` directory if needed and uses it as the working directory, or reports an error if the bundled CLI is missing.

#### Scenario: Unusable workspace
- **WHEN** the selected path is relative, missing or not a directory, or a caller relies on a session workspace with a nonblank SSH host
- **THEN** the wrapper rejects the call before launching the CLI.

<!-- id: openspec-run-workspace -->
<!-- kind: invariant -->
<!-- entities: workspace, CLI root -->
<!-- enforced: plugins/openspec/src/openspec/run.ts default export (workspace, cwd) -->

### Requirement: Argument refusals

The wrapper SHALL reject malformed argument vectors and explicit store selection before invoking the CLI.

#### Scenario: Malformed arguments
- **WHEN** args is not a nonempty array of strings or an argument contains a NUL character
- **THEN** the call fails with an argument error.

#### Scenario: Store selection
- **WHEN** the first argument is `store` or any argument is `--store` or starts with `--store=`
- **THEN** the wrapper refuses the call as unsupported.

<!-- id: openspec-run-args -->
<!-- entities: CLI arguments, store -->
<!-- enforced: plugins/openspec/src/openspec/run.ts default export (opts.args guards) -->

### Requirement: Initialization defaults

The wrapper SHALL append `--tools none` to `init` only when no tools option is present.

#### Scenario: Caller specifies tools
- **WHEN** `init` includes `--tools` or an argument starting with `--tools=`
- **THEN** the wrapper passes the arguments without adding a tools selection.

<!-- id: openspec-run-init -->
<!-- entities: init, tools -->
<!-- enforced: plugins/openspec/src/openspec/run.ts default export (init branch) -->

### Requirement: Archive purpose preflight

Before archiving a named change without `--skip-specs`, the wrapper SHALL refuse deltas for new capabilities whose Purpose is missing, shorter than 50 characters after trimming and comment removal, or begins with the word TBD or TODO regardless of case.

#### Scenario: Refused new capabilities
- **WHEN** an archive request names a change with multiple new capability specs that fail the Purpose check
- **THEN** the wrapper reports the failing capability paths in sorted order without launching the CLI, even with `--no-validate`.

#### Scenario: Existing capability or skipped specs
- **WHEN** the delta has a corresponding main spec, or the archive arguments include `--skip-specs`
- **THEN** the wrapper does not require a written Purpose for that delta.

<!-- id: openspec-run-check-new-capability-purpose -->
<!-- entities: archive, change delta, main spec -->
<!-- enforced: plugins/openspec/src/openspec/run.ts checkNewCapabilityPurpose and default export (archive branch) -->
<!-- test: plugins/openspec/src/openspec/openspec.test.ts :: run: archive is refused when a new capability delta has no written Purpose -->

### Requirement: Captured process outcome

The wrapper SHALL return the exit code, success exactly for exit code zero, and separate bounded stdout and stderr strings with a shared truncation flag.

#### Scenario: Long output
- **WHEN** either stream exceeds 65,536 UTF-16 code units after stripping CSI sequences consisting of digits, semicolons or question marks followed by a letter
- **THEN** the wrapper returns only the first 65,536 code units of each cleaned stream and sets `truncated` to true; otherwise it returns both cleaned streams with `truncated` false.

#### Scenario: Process timeout
- **WHEN** the spawned process remains running at the timeout (60 seconds by default, clamped to 1 through 300 seconds)
- **THEN** the wrapper requests process termination and uses the resulting exit code rather than a separate timeout result.

<!-- id: openspec-run-process-result -->
<!-- entities: process, exit code, output streams -->
<!-- enforced: plugins/openspec/src/openspec/run.ts default export (timer, clean, LIMIT, return object) -->

<!-- uncertainty: The archive test exercises missing and placeholder Purpose and an existing main spec, not sorting, the exact length boundary or skip-specs. No direct assertions for argument guards, initialization defaults, timeout or stream limits were found in the inspected test file. -->
<!-- deferred: CLI command semantics beyond the wrapper belong to the bundled dependency; viewer validation and the external pre-write validator are outside this capability. -->