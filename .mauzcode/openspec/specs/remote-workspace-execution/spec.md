# Remote workspace execution

## Purpose

Describe how callers select a workspace and distinguish file, command and background job outcomes without assuming a live connection.

<!-- Last verified: d35de7c2, 2026-11-22 (source inspection only) -->

## Requirements

### Requirement: Select an existing workspace

Setting a remote workspace SHALL record the normalized directory and host only after directory resolution succeeds.

#### Scenario: Select a directory on an alias
- **WHEN** the selected directory resolves on the requested host
- **THEN** the agent stores its physical absolute path and host, and the caller receives `host:path`.

<!-- id: workspace.set.normalized -->
<!-- entities: agent, workspace -->
<!-- enforced: src/workspace/set.ts default export; src/workspace/normalize.ts default export -->
<!-- test: src/remote/workspace.it.test.ts :: workspace.set resolves the dir on the host and stores host + absolute path -->

#### Scenario: Switch back to local
- **WHEN** the caller sets an existing local directory without a host
- **THEN** the stored host becomes empty and the result is the local absolute directory.

### Requirement: Resolve tool targets

File paths and command working directories SHALL use the selected host's workspace base only when targeting the workspace host.

#### Scenario: Use the remote workspace
- **WHEN** a caller supplies a relative path and omits the host in a remote workspace
- **THEN** the tool targets that host and joins the path to the workspace directory; an omitted path selects the directory itself.

<!-- id: workspace.target.base -->
<!-- entities: host, path, workspace -->
<!-- enforced: src/workspace/target.ts default export; src/tools/read.ts and src/tools/bash.ts calls to workspace.target -->
<!-- test: src/remote/workspace.it.test.ts :: workspace.target: the one rule every tool follows -->

#### Scenario: Override the remote host
- **WHEN** a caller selects another SSH alias with a relative path
- **THEN** the path remains relative to that alias's home; selecting `local` instead resolves it against the server working directory.

### Requirement: Bound binary reads

A remote binary read SHALL return the file bytes without text decoding or reject the read if the file exceeds the effective size limit.

#### Scenario: File grows during transfer
- **WHEN** the streamed byte count exceeds the limit after the initial size check
- **THEN** the read stops with a size error rather than returning a partial file.

<!-- id: remote.readBytes.overflow -->
<!-- entities: remote file, byte limit -->
<!-- enforced: src/remote/readBytes.ts default export -->
<!-- test: src/remote/readBytes.test.ts :: the transfer stops at maxBytes even when the remote keeps sending -->

### Requirement: Distinguish command completion from timeout

Remote execution SHALL report stdout and stderr separately and distinguish a timeout from a command exit code.

#### Scenario: Deadline expires
- **WHEN** the deadline expires while input is still pending
- **THEN** the result marks the command timed out and returns a null exit code.

<!-- id: remote.exec.timedOut -->
<!-- entities: command, deadline -->
<!-- enforced: src/remote/exec.ts default export -->
<!-- test: src/remote/remote.it.test.ts :: review: exec caps captured output and still times out while stdin is pending -->

### Requirement: Present remote shell outcomes

The bash tool SHALL return output on success and flag remote timeouts and nonzero exits as errors.

#### Scenario: Ordinary nonzero exit
- **WHEN** a remote command exits with code 2
- **THEN** the output starts with `[exit 2]` and includes stderr and a labeled stdout section, subject to output truncation.

<!-- id: tools.bash.remote.exitCode -->
<!-- entities: bash result, command -->
<!-- enforced: src/tools/bash.ts remote -->
<!-- test: src/remote/remote.it.test.ts :: bash tool with host: cwd, env, error shape, output cap, unreachable host -->

### Requirement: Report job launch state

Starting a named remote job SHALL distinguish a launch error from a successful launch whose session may already have ended.

#### Scenario: Duplicate live session
- **WHEN** the named session already exists and restart was not requested
- **THEN** start rejects the request rather than replacing the running session.

<!-- id: remote.start.running -->
<!-- entities: job, session -->
<!-- enforced: src/remote/start.ts default export -->
<!-- test: src/remote/remote.it.test.ts :: background jobs: start, jobs, logs, stop, restart guard -->

#### Scenario: Job exits before the status check
- **WHEN** launch succeeds but the session has ended by the post-launch check
- **THEN** start returns the job name, session, log path and log tail with `running` false.

### Requirement: List jobs with retained logs

The remote jobs listing SHALL include jobs with matching log files even when their sessions no longer exist.

#### Scenario: Retained log after exit
- **WHEN** a named job has a log but no matching session
- **THEN** the listing includes its name, a false running flag and a last-line preview.

<!-- id: remote.jobs.log -->
<!-- entities: job, log -->
<!-- enforced: src/remote/jobs.ts default export -->

<!-- uncertainty: No live SSH, shell or tmux behavior was exercised; job status describes a sampled session, not future availability. -->
<!-- deferred: src/remote/logs.ts, src/remote/stop.ts -->
