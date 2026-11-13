## ADDED Requirements

### Requirement: Distinguish create from replace

`write` SHALL support `mode: 'create'` with `path`, optional `host` and `content`, which fails with `conflict` when the file already exists, and `mode: 'replace'` with `readId` and `content`, which requires a readId from a complete read of the current version.

#### Scenario: Create a new file
- **WHEN** an agent creates a file that does not exist
- **THEN** the file is written, parent directories are created, and a readId for it is returned

#### Scenario: Create over an existing file
- **WHEN** an agent uses create mode for an existing path
- **THEN** nothing is overwritten and the result reports `conflict`

#### Scenario: Replace from a partial read
- **WHEN** an agent replaces a file using a readId from a range read
- **THEN** the call is rejected as `invalid` with guidance to read the whole file

#### Scenario: Replace after a concurrent change
- **WHEN** the file changed since the complete read
- **THEN** nothing is written and the result reports `conflict` with a new readId

### Requirement: Publish writes atomically under a per-file lock

`files.write` SHALL keep its signature and SHALL write every file, locally or over SSH, by taking a per-file lock with bounded waiting, checking any precondition inside the lock (`expectedVersion`, `expectedContent`, `ifAbsent`), writing a temporary file in the same directory, keeping the file mode, and renaming it into place. A failed or refused write SHALL leave the original file intact. Locks SHALL NOT be stolen automatically.

#### Scenario: Two cooperating writers
- **WHEN** two edits based on the same version reach the commit at the same time
- **THEN** exactly one is applied and the other reports `conflict`

#### Scenario: Failure during write
- **WHEN** writing the temporary file fails
- **THEN** the target file keeps its previous content

### Requirement: Route existing save paths through the commit service

The Files PUT route and the Canvas item save SHALL pass their existing expected-content check to `files.write`, so it is evaluated inside the lock. Their HTTP contracts, authentication and CSRF handling SHALL stay unchanged.

#### Scenario: Browser save races an agent edit
- **WHEN** an agent edit is published between the browser's load and save
- **THEN** the browser save is refused instead of overwriting the agent's change

### Requirement: Preserve line endings, final newline and BOM

Edits and replacements SHALL keep the file's original line-ending style, final-newline state and BOM unless the new content explicitly changes them. Line operations SHALL leave the bytes of untouched lines unchanged.

#### Scenario: Anchor edit in a CRLF file
- **WHEN** one line of a CRLF file is replaced by anchor
- **THEN** every line, including the new one, still ends with CRLF

### Requirement: Keep legacy calls working with a warning

Path-only `edit` and path+content `write` SHALL keep working. They SHALL be applied under the lock against the current file and SHALL return a warning that no version was checked, plus a new readId. Tool documentation SHALL describe only the readId forms.

#### Scenario: Legacy edit
- **WHEN** an agent sends `edit({ path, edits })` without a readId
- **THEN** the edit is applied atomically to the current file and the result contains a warning and a readId

### Requirement: State the limits of the lock

Documentation SHALL state that the lock coordinates only MauzCode writers. `bash`, direct `Bun.write`/`node:fs` calls and external editors do not participate, and a change they make between the final check and the rename can be lost.

#### Scenario: External writer race
- **WHEN** a test writes the file without the lock between the check and the rename
- **THEN** the result is recorded as a known limitation, not as a passed protection test
