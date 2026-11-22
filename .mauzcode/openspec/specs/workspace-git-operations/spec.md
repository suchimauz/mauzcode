# Workspace Git operations

## Purpose
Describe how programmatic callers inspect the working tree, stage paths, commit the index and optionally push in a local or SSH workspace.

<!-- Last verified: 2026-11-22 at d35de7c21ff42cdbfb2db0272d6874d4db17a4e0; static inspection, clean src/git inputs. -->

## Requirements

### Requirement: Working-tree status
Detailed status SHALL report cleanliness and omit empty change groups. A path may appear in more than one group.

#### Scenario: Index deletion alongside an untracked file
- **WHEN** Git reports an index deletion and an untracked file but no other changes
- **THEN** `clean` is false, the deleted path appears in both `staged` and `deleted`, and the other path appears in `untracked` only

<!-- id: git.status.porcelain -->
<!-- entities: index, working tree, paths -->
<!-- enforced: src/git/status.ts default export, porcelain record loop -->
<!-- test: src/git/status.test.ts :: groups porcelain output by full status names; omits empty keys in normal mode -->

### Requirement: Staged and summary views
Staged mode SHALL request no untracked files. Summary mode SHALL take precedence over staged detail and count distinct paths in its total rather than summing category counts.

#### Scenario: Unstaged edit only
- **WHEN** a tracked file has only a working-tree edit and staged mode is requested
- **THEN** detail returns only `clean: true`, but with summary also requested the result is `clean: false`, `total: 1`, `modified: 1`

#### Scenario: No changes reported
- **WHEN** the status command returns no records in summary mode
- **THEN** the result contains only `clean: true`

<!-- id: git.status.summary -->
<!-- entities: status view, paths, category counts -->
<!-- enforced: src/git/status.ts default export, opts.summary and opts.staged branches -->
<!-- test: src/git/status.test.ts :: summary mode returns only total and non-zero counts; summary mode for clean repo stays tiny; staged mode returns only staged-focused data; uses no-untracked flag for staged mode -->

### Requirement: Staging paths
Staging SHALL reject a missing or empty path list and pass supplied paths after the option terminator to Git add.

#### Scenario: Option-like filename
- **WHEN** the sole supplied path is `-n`
- **THEN** the arguments are `add`, `--`, `-n`, so the filename is not a dry-run flag

<!-- id: git.stage.paths -->
<!-- entities: paths, index -->
<!-- enforced: src/git/stage.ts default export -->

### Requirement: Committing the index
Commit SHALL reject a blank message before invoking Git, preserve a nonblank message as supplied, and request an empty commit only when allowEmpty is set to true.

#### Scenario: Whitespace-only message
- **WHEN** a caller supplies only spaces as the commit message
- **THEN** the operation rejects with `commit message required` without creating a commit

<!-- id: git.commit.message -->
<!-- entities: index, commit message -->
<!-- enforced: src/git/commit.ts default export -->

### Requirement: Push destination
Push SHALL append a supplied nonempty remote and then a supplied nonempty branch to the push command without inserting a default remote name.

#### Scenario: Git selects the destination
- **WHEN** neither a remote nor a branch is supplied
- **THEN** the helper invokes bare `git push`, leaving destination selection to Git

<!-- id: git.push.args -->
<!-- entities: remote, branch -->
<!-- enforced: src/git/push.ts default export -->

### Requirement: Ordered operations
The combined operation SHALL await staging, then committing, then pushing unless push is false, using the same host and directory. A rejected step SHALL stop the sequence without rolling back completed steps.

#### Scenario: Skip delivery
- **WHEN** staging and committing succeed with `push: false`
- **THEN** the caller receives the stage and commit results under `staged` and `committed`, with `pushed: null`

#### Scenario: Commit rejected after staging
- **WHEN** staging succeeds but the commit helper rejects a blank message
- **THEN** the combined call rejects, the paths remain staged, and no push is attempted

<!-- id: git.stageCommitPush.sequence -->
<!-- entities: stage result, commit result, push result -->
<!-- enforced: src/git/stageCommitPush.ts default export -->
<!-- test: src/git/stageCommitPush.test.ts :: stageCommitPush can skip push -->

### Requirement: Local and SSH command failures
For completed local or SSH commands, the runner SHALL return ok, code, stdout and stderr on success or allowed failure. Otherwise it SHALL throw on failure, preferring stderr, then stdout, then an exit-code diagnostic.

#### Scenario: Git rejects a command
- **WHEN** Git exits nonzero with a diagnostic on stderr
- **THEN** the default call throws that diagnostic; with `allowFailure: true` it returns `ok: false` and the diagnostic on stderr

#### Scenario: Output budget reached
- **WHEN** a local stream exceeds the configured byte limit or a returned SSH stream reaches the configured character limit
- **THEN** the runner treats the command as failed with code -1, empty stdout and `Git output limit exceeded` rather than reporting partial success

<!-- id: git.run.failure -->
<!-- entities: workspace host, Git result, diagnostic -->
<!-- enforced: src/git/run.ts default export, at.host and !out.ok branches -->

<!-- uncertainty: Rename coverage uses a synthetic arrow-delimited payload, not a real NUL-separated rename pair. The inspected tests do not exercise combined status flags, failed workflow steps, actual push or SSH transport. -->
<!-- deferred: src/workspace/target.ts; src/remote/exec.ts; src/remote/quote.ts (workspace resolution and SSH transport boundaries). -->
