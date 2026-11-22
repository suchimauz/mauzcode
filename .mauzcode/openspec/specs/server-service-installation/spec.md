# Host server service installation

## Purpose
Describe how the host scripts choose a user service, protect existing installations and decide whether the server has answered.

<!-- Last verified: 2026-11-22 at d35de7c2; inspected source and test inputs were clean. -->
<!-- source: script/install.sh, script/install-service.sh, script/run-service.ts, script/uninstall.sh, docker-compose.yml, script/install-service.test.ts -->
<!-- uncertainty: The named tests inspect shell text, not a running installation. Host tools, networking and service-manager effects were not exercised. -->

## Requirements

### Requirement: Choose the host service locally
The installer SHALL select the user service from the local kernel name and reject unsupported kernels before checking dependencies.

#### Scenario: Darwin or Linux reaches service setup
- **WHEN** database setup succeeds on Darwin or Linux
- **THEN** Darwin delegates to the LaunchAgent installer; Linux writes a systemd user unit, enables it with immediate start and requests a restart. Both configure Bun to run `script/run-service.ts` from the checkout with the selected port (default 3010).

#### Scenario: Unsupported host
- **WHEN** `uname -s` returns neither Darwin nor Linux
- **THEN** installation exits with status 1 before attempting to obtain Bun or the checkout.

<!-- id: install-os-service -->
<!-- entities: kernel, user service, checkout -->
<!-- enforced: script/install.sh:35-39, script/install.sh:119-145, script/install-service.sh:80-120 -->
<!-- test: script/install-service.test.ts :: install-service > runs through the bounded-log wrapper (LaunchAgent wrapper text only) -->

### Requirement: Preserve existing checkout history
The installer SHALL refuse an existing non-checkout destination and restrict updates of an existing checkout to fast-forwards on the configured branch.

#### Scenario: Checkout cannot fast-forward
- **WHEN** the branch fetch succeeds but the checkout is on another branch or the fast-forward merge fails
- **THEN** the installer continues to dependency installation without switching branches or resetting local commits.

#### Scenario: Destination exists without a .git directory
- **WHEN** the configured path exists but does not contain a `.git` directory
- **THEN** the installer exits with status 1 instead of cloning over it.

<!-- id: install-mauzcode-dir-checkout -->
<!-- entities: checkout, configured branch -->
<!-- enforced: script/install.sh:55-71 -->

### Requirement: Preserve database configuration across installs
The installer SHALL back up a differing user Compose file before replacing it, reuse the last configured nonempty password value if the last password entry is nonempty, and configure a loopback database connection.

#### Scenario: Reinstall with customized Compose and an existing password
- **WHEN** the user Compose file differs from the repository copy and the final password entry is nonempty
- **THEN** the installer copies the old file to a timestamped sibling before replacement and uses the existing password in the checkout database URL at `127.0.0.1:54393`.

#### Scenario: No usable password entry
- **WHEN** the final password entry is missing or empty
- **THEN** the installer generates a password from 24 random bytes, preserves other database environment entries and sets the environment file mode to 0600.

<!-- id: install-dbenv-compose -->
<!-- entities: Compose file, database environment, database URL -->
<!-- enforced: script/install.sh:85-116, docker-compose.yml:46-49 -->

### Requirement: Refuse an unrecognized listener
The LaunchAgent installer SHALL exit rather than signal the remaining listener it inspects unless both its working directory and server command match.

#### Scenario: Port still occupied after waiting for release
- **WHEN** the first remaining listener has a different working directory from the checkout or its command lacks `src/$main.ts`
- **THEN** the installer reports the port conflict and exits with status 1 without sending a kill signal to that PID.

<!-- id: install-service-existing-cwd -->
<!-- entities: port, listener, checkout -->
<!-- enforced: script/install-service.sh:60-75 -->
<!-- test: script/install-service.test.ts :: install-service > refuses to kill an unrelated listener (text assertions only) -->

### Requirement: Distinguish HTTP response from application health
The installers SHALL accept HTTP status codes from 100 through 599 as evidence of a listening server and fail if all readiness probes miss that range.

#### Scenario: Server responds with an error status
- **WHEN** the root URL on the configured loopback port returns 503 during installation polling
- **THEN** the readiness loop accepts the response rather than requiring a successful application request.

#### Scenario: No HTTP response
- **WHEN** none of the LaunchAgent installer's 30 probes or none of the outer installer's 60 probes receives an acceptable status
- **THEN** the installer whose loop exhausted exits with status 1.

<!-- id: install-service-ready -->
<!-- entities: HTTP response, readiness probe -->
<!-- enforced: script/install-service.sh:127-140, script/install.sh:147-158 -->
<!-- test: script/install-service.test.ts :: install-service > fails installation when readiness never arrives (text assertions only) -->

### Requirement: Separate server output from wrapper errors
The service wrapper SHALL launch the server from the checkout and route its standard output and error to separate rotating application logs.

#### Scenario: Server writes a diagnostic to standard error
- **WHEN** the child running `src/$main.ts` emits a standard-error chunk
- **THEN** the wrapper checks rotation before appending the chunk to `.runtime/server.error.log`; standard output goes to `.runtime/server.log` instead.

<!-- id: run-service-start-pump -->
<!-- entities: server process, application logs -->
<!-- enforced: script/run-service.ts:start, script/run-service.ts:pump, script/run-service.ts:rotate -->

### Requirement: Keep removal separate from purge
Ordinary uninstall SHALL leave the checkout, user Compose file and database volumes in place. Purge SHALL require confirmation unless explicitly bypassed.

#### Scenario: Ordinary removal with Compose available
- **WHEN** no purge is requested and the uninstaller finds an accessible database container and user Compose file
- **THEN** it requests Compose shutdown without volume removal and does not delete the checkout or Compose file.

#### Scenario: Purge not confirmed
- **WHEN** purge is requested without `-y` or `--yes` and the terminal answer does not begin with y or Y
- **THEN** the uninstaller exits with status 1 before stopping the service or removing data.

<!-- id: uninstall-purge-confirm -->
<!-- entities: checkout, database volume, user service -->
<!-- enforced: script/uninstall.sh:32-37, script/uninstall.sh:51-73 -->
