# Spec Delta

## Purpose

Reduce local agent shell output through an explicitly enabled RTK integration while making availability observable and preserving authorization, command execution semantics and safe recovery from preparation failures.

## ADDED Requirements

### Requirement: Default-off local shell scope
The official RTK plugin SHALL provide an instance-wide integration disabled by default. Automatic processing SHALL apply only to local bash tool calls, including explicit `host:"local"`. SSH targets, implicitly remote workspaces, interactive terminals, non-shell tools and direct internal shell execution outside the bash tool SHALL remain unchanged. An absent or unloaded plugin SHALL leave the original execution path available.

#### Scenario: First installation
- **GIVEN** the plugin has no saved enabled state
- **WHEN** a local bash call runs
- **THEN** it runs without invoking RTK preparation.

#### Scenario: Remote target
- **GIVEN** RTK is enabled locally
- **WHEN** bash resolves to an SSH host, explicitly or from its workspace
- **THEN** the remote command runs through the existing path without RTK preparation.

#### Scenario: Plugin unavailable
- **GIVEN** the plugin is absent or unloaded
- **WHEN** a bash call runs
- **THEN** plugin absence does not prevent normal execution.

### Requirement: Availability is verified independently of enablement
The RTK settings tab SHALL distinguish availability from enablement and offer a toggle and separate Check RTK action. Checks SHALL verify executable health and rewrite compatibility, not file presence alone, with bounded time and output. Successful checking SHALL NOT automatically enable RTK.

#### Scenario: Availability controls and facts
- **WHEN** the owner views RTK settings
- **THEN** availability is shown as not checked, checking, available or unavailable, separately from enabled state, with known executable path, version, last check time and a safe failure reason.

#### Scenario: Safe executable probe
- **WHEN** the owner requests a check
- **THEN** RTK is discovered on the server PATH and checked through version execution and rewrite of a fixed read-only probe, without executing the probe command.

#### Scenario: Healthy executable
- **GIVEN** a working compatible RTK executable is on the server PATH
- **WHEN** the owner requests a check
- **THEN** availability becomes available with path, version and timestamp, without changing disabled to enabled.

#### Scenario: Installed binary cannot execute
- **GIVEN** RTK is missing, not executable, exits on SIGILL, times out or fails the rewrite protocol check
- **WHEN** availability is checked
- **THEN** availability is unavailable, enabled is false and a meaningful reason is shown.

#### Scenario: No implicit installation
- **GIVEN** RTK is unavailable
- **WHEN** a check fails
- **THEN** no executable is installed or updated and no RTK or agent permission configuration is changed.

### Requirement: Guarded enablement and durable disabling
Instance-scoped enablement SHALL require a fresh successful backend check and owner-authorized, CSRF-protected writes. Generic settings writes SHALL NOT bypass checking. Disable and failure transitions SHALL invalidate stale successes. Restored enabled state SHALL be revalidated before use. Technical preparation failure SHALL require explicit checked re-enablement.

#### Scenario: Direct enable request against unavailable RTK
- **GIVEN** RTK is unavailable, regardless of what the browser previously displayed
- **WHEN** an enable request reaches the backend
- **THEN** the request cannot enable the integration.

#### Scenario: Stale check finishes after disable
- **GIVEN** an enable operation is waiting on its check
- **WHEN** the owner disables RTK before that check finishes
- **THEN** the late successful check does not enable RTK.

#### Scenario: Restart with saved enablement
- **GIVEN** the instance restarts with RTK previously enabled
- **WHEN** the first eligible shell call arrives
- **THEN** availability is verified before RTK is used and a failed check disables it.

#### Scenario: Binary recovers after a failure
- **GIVEN** technical failure disabled RTK
- **WHEN** the binary becomes healthy or a later manual check succeeds
- **THEN** RTK remains disabled until an explicit enable action passes a fresh check.

#### Scenario: Unauthorized mutation
- **GIVEN** a request lacks owner authority or a valid write CSRF token
- **WHEN** it attempts to check, enable or disable RTK through a state-changing API
- **THEN** the backend rejects the operation independently of UI controls.

### Requirement: Per-call bypass
The bash tool SHALL accept optional `rtk:false` to bypass automatic RTK preparation for that call. Omission SHALL use instance policy. The parameter SHALL NOT force-enable disabled integration or modify the instance setting. Bypass SHALL NOT remove an explicit RTK invocation written in the command itself.

#### Scenario: Request original output
- **GIVEN** RTK is enabled
- **WHEN** a local bash call includes `rtk:false`
- **THEN** the original command executes without an automatic RTK check or rewrite and enabled state is unchanged.

#### Scenario: Explicit RTK command
- **GIVEN** the command itself invokes RTK
- **WHEN** automatic processing is bypassed
- **THEN** the explicit command is executed as written.

### Requirement: Context-preserving bounded preparation
Each eligible call SHALL receive bounded health checking and rewrite preparation using its effective cwd, environment and PATH. The complete command SHALL be passed as one argument without shell evaluation. Checked and executed binaries SHALL be consistent. Preparation SHALL count toward the caller deadline and SHALL NOT impersonate another agent or change permission files.

#### Scenario: No host impersonation
- **WHEN** the integration prepares a command
- **THEN** it does not set RTK_REWRITE_HOST to impersonate another agent or modify agent permission configuration.

#### Scenario: Command contains shell syntax
- **GIVEN** a command contains quotes, a chain, redirects or substitutions
- **WHEN** rewrite is invoked
- **THEN** the entire original command is passed as data, RTK decides support, and no user command is executed during preparation.

#### Scenario: Custom environment
- **GIVEN** the call supplies custom cwd, PATH or secret environment references
- **WHEN** preparation and execution occur
- **THEN** they honor the same effective context without silently switching to a different executable or losing the environment.

#### Scenario: Deadline exhausted during preparation
- **GIVEN** the caller's total deadline expires before user-command execution
- **WHEN** preparation completes or fails
- **THEN** no user command starts, including through fallback, and a timeout is returned.

### Requirement: Rewrite outcomes preserve host authorization
Codes 0/3 with a valid nonempty replacement SHALL prepare that command under MauzCode authority, without a new code-3 confirmation. Code 1 without replacement SHALL preserve the original and enabled state. Code 2 SHALL deny execution with safe diagnostics and no fallback. Documentation SHALL explain that Claude Code ask rules are not independent MauzCode authorization barriers.

#### Scenario: Replacement with code 0 or 3
- **GIVEN** rewrite returns code 0 or 3 and a valid nonempty command
- **WHEN** MauzCode's applicable authorization permits execution
- **THEN** the replacement executes once without extra confirmation solely due to code 3.

#### Scenario: No supported rewrite
- **GIVEN** rewrite returns code 1 without a replacement
- **WHEN** the command proceeds
- **THEN** the original executes once and RTK is not disabled.

#### Scenario: Denial
- **GIVEN** rewrite returns code 2, with or without a diagnostic
- **WHEN** preparation ends
- **THEN** neither the original nor replacement executes and the denial is not treated as technical fallback.

#### Scenario: Already wrapped command
- **GIVEN** RTK returns the original command as its valid replacement
- **WHEN** execution is authorized
- **THEN** it executes once without recursively invoking the preparation step.

### Requirement: Technical fallback never repeats execution
Technical preparation failures SHALL disable RTK, retain a safe reason and execute the original once if time remains. These include spawn errors, signals, timeouts, unknown codes, invalid responses and output overflow; truncated commands SHALL NOT execute. After execution starts, automatic retries and fallback SHALL NOT occur. A nonzero command result alone SHALL NOT establish RTK unavailability.

#### Scenario: Rewrite process crashes
- **GIVEN** rewrite fails technically before the user command starts and time remains
- **WHEN** recovery is applied
- **THEN** RTK is disabled and the original command runs exactly once with a brief safe disablement notice.

#### Scenario: Rewritten command fails after starting
- **GIVEN** execution of the replacement has started
- **WHEN** it fails, times out or its RTK process crashes
- **THEN** its result is returned without rerunning the original or replacement.

#### Scenario: Invalid or oversized rewrite
- **GIVEN** a response is empty for code 0/3, contradictory for code 1, has an unknown code or exceeds the preparation output limit
- **WHEN** the integration handles it
- **THEN** it follows technical-failure handling rather than executing incomplete output.

### Requirement: Existing execution observability and secrecy
The bash tool SHALL preserve existing execution timeout, output-limit, streaming and error-format behavior, except for the explicitly specified preparation budget and diagnostic notices. Existing tool-run details SHALL distinguish original and actually executed commands without a second tool invocation. New diagnostics and metadata SHALL redact resolved secrets. The integration SHALL NOT retain additional raw output for analytics or automatically replay a command to recover full output.

#### Scenario: Rewritten command is inspected
- **GIVEN** automatic processing changed the command
- **WHEN** the owner inspects its tool-run details
- **THEN** the original and executed commands are distinguishable and resolved secrets are masked.

#### Scenario: Secret appears in a preparation diagnostic
- **GIVEN** a preparation diagnostic contains a resolved secret value
- **WHEN** it is shown, streamed or persisted by the integration
- **THEN** the secret value is redacted.

#### Scenario: Full output is needed later
- **GIVEN** a command already completed with RTK processing
- **WHEN** an agent needs full output
- **THEN** the integration does not automatically replay it; any new call must be separately justified and may explicitly use `rtk:false`.
