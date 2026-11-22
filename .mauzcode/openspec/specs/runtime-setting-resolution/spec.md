# Runtime setting resolution

## Purpose
Describe how callers resolve a setting for a scope, distinguish its source, and change an override without displacing instance-file policy.

<!-- Last verified: d35de7c2, 2026-11-22; source inspection only. -->

## Requirements

### Requirement: Resolve values in scope
A read SHALL prefer the applicable file value, then the exact stored override, then a global declaration's environment value or default, returning undefined if none applies.

#### Scenario: Instance file masks a stored override
- **WHEN** an empty-ID global lookup matches both an accepted file entry and a stored row
- **THEN** the lookup returns the file value, even if a declared environment value also exists.

#### Scenario: Scoped lookup has no row
- **WHEN** a non-global scope has no row for its module, scope type, scope ID and key
- **THEN** the lookup returns undefined rather than inheriting an instance value.

#### Scenario: Global scope has a nonempty ID
- **WHEN** that ID has no matching row
- **THEN** the lookup skips the file and the empty-ID row but still consults the global declaration.

#### Scenario: Environment supplies a declared value
- **WHEN** a global lookup reaches a non-null declared environment value
- **THEN** it converts the string with Number for numbers, treats only `true` and `1` as true for booleans, and otherwise returns the string.

<!-- id: settings-get-scope-resolution -->
<!-- entities: setting, scope, override, declaration -->
<!-- enforced: src/settings/get.ts default export and parseEnv -->
<!-- verified_by: src/settings/declared.test.ts :: settings.get fallback chain: DB → env → declared default; src/settings/declared.test.ts :: declared default not consulted for non-global scopes; src/settings/files.test.ts :: a file value wins over db and env, and set() refuses it -->

### Requirement: Validate instance-file entries independently
The file reader SHALL expose accepted entries by qualified key with their source paths, warn about undeclared keys, and report invalid declared entries as errors without dropping valid siblings.

#### Scenario: Mixed entries in one module file
- **WHEN** `$settings_agent.json` contains an undeclared key, a string for a declared number, and a valid boolean
- **THEN** only the boolean is exposed, with its file path; the unknown key produces a warning and the number produces a type error.

#### Scenario: Select settings directory
- **WHEN** MAUZCODE_SETTINGS is unset and HOME is set
- **THEN** the reader looks in `$HOME/.mauzcode/settings`; an explicit MAUZCODE_SETTINGS selects the directory instead.

<!-- id: settings-files-invalid -->
<!-- entities: instance file, declaration, diagnostic -->
<!-- enforced: src/settings/files.ts default export and invalid -->
<!-- verified_by: src/settings/files.test.ts :: undeclared keys warn, wrong types and secrets are rejected -->

### Requirement: Refresh file values without discarding a last good object on parse failure
The reader SHALL reuse its same-directory snapshot within one second unless forced, detect changes by filename and modification time thereafter, and report unreadable or malformed files while retaining their last parsed entries when available.

#### Scenario: Broken replacement
- **WHEN** a forced scan encounters malformed JSON in a previously valid file
- **THEN** the reader reports an error and rechecks the previous object's entries against current declarations.

#### Scenario: Removed file
- **WHEN** a fresh scan no longer finds a previously accepted file
- **THEN** its entries no longer fix values in the returned snapshot.

<!-- id: settings-files-perfile-recovery -->
<!-- entities: instance file, snapshot -->
<!-- enforced: src/settings/files.ts default export, cache.perFile -->
<!-- verified_by: src/settings/files.test.ts :: broken JSON keeps the last good values -->

### Requirement: Persist permitted overrides by exact address
Setting a value SHALL insert or replace the JSON override at its module, scope type, scope ID and key, subject to file locks and global declaration validation.

#### Scenario: Scoped override of a file-fixed key
- **WHEN** a caller writes a file-fixed key at empty-ID global scope
- **THEN** set rejects it with SETTING_FIXED, status 409, settingKey and fixedBy path; a user-scoped write to that key can still be stored independently.

#### Scenario: Declaration rejects a global write
- **WHEN** a global descriptor validator throws, or an empty-ID global enum value is outside its resolved options
- **THEN** set does not store the write; the enum membership rejection carries SETTING_INVALID and status 400.

<!-- id: settings-set-scoped-upsert -->
<!-- entities: override, scope, declaration -->
<!-- enforced: src/settings/set.ts default export -->
<!-- verified_by: src/settings/store.test.ts :: set/get roundtrip for global and agent scopes; src/settings/files.test.ts :: a file value wins over db and env, and set() refuses it; src/settings/enumOptions.test.ts :: settings.set rejects an unregistered value and accepts a plugin-provided one -->

### Requirement: Report declared values with provenance
The declared listing SHALL report the empty-ID global value of each registered qualified setting with its descriptor and winning source, without rewriting stored values.

#### Scenario: Source follows the effective value
- **WHEN** a caller lists declarations
- **THEN** a fixed entry reports `file` and its path; otherwise the first applicable source is `db`, `env`, or `default`. Without a registry the list is empty.

#### Scenario: Stored enum option disappears
- **WHEN** a non-null stored enum value is absent from the descriptor's resolved options
- **THEN** the listing retains the value and marks it unavailable.

<!-- id: settings-declared-source -->
<!-- entities: declaration, value, source -->
<!-- enforced: src/settings/declared.ts default export and mark -->
<!-- verified_by: src/settings/declared.test.ts :: source = default when nothing in DB or env; src/settings/declared.test.ts :: source = env when env var set, no DB row; src/settings/declared.test.ts :: source = db when set() was called; src/settings/enumOptions.test.ts :: a stored value outside the resolved options is marked unavailable, not rewritten -->

### Requirement: Save or reset a declared global override
The declared JSON mutation endpoint SHALL reject unknown names and file-fixed settings, validate saves against the declaration, and reset an unlocked key by deleting only its empty-ID global override.

#### Scenario: Request selects a fixed or unknown name
- **WHEN** an otherwise authorized save or reset names a fixed declaration or an unknown setting
- **THEN** the endpoint returns 409 for the fixed declaration or 400 for the unknown name without changing the override.

#### Scenario: Save a number
- **WHEN** an accepted JSON save names an unlocked number setting
- **THEN** a finite number within any declared bounds is submitted to set; a string or out-of-bounds number returns 400 without a write.

#### Scenario: Reset reveals a fallback
- **WHEN** a valid reset removes the global override for a declaration with an environment value
- **THEN** the response reports success and the next global read resolves the environment value.

<!-- id: settings-browserapi-declared-mutation -->
<!-- entities: declared endpoint, override, declaration -->
<!-- enforced: src/settings/$route_declared_POST.ts default export; src/settings/browserApi.ts default export, declared POST branch; src/settings/remove.ts default export -->

<!-- uncertainty: The cited fallback and file tests do not establish the nonempty global ID edge, boolean conversion matrix, or cache timing. No endpoint reset test is cited. -->
<!-- deferred: src/settings/getNumber.ts, src/settings/getString.ts (typed caller fallbacks); presentation, model-specific options and secret internals are outside this baseline. -->