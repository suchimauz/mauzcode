# Secret reference storage

## Purpose

Let callers discover credentials without reading their values, replace them under stable references, and collect them without returning plaintext from a saved prompt.

<!-- Last verified: d35de7c2, 2026-11-22 (source inspection only) -->

## Requirements

### Requirement: List references without reading values

Discovery SHALL select only namespace, name, source, version and timestamps, and return those fields with the corresponding reference.

#### Scenario: Filter stored entries
- **WHEN** a caller supplies a namespace and a query
- **THEN** results match the exact namespace and the case-insensitive search across namespace/name, treating percent and underscore as literal characters, ordered by namespace then name.

<!-- id: secrets.list.metadata-projection -->
<!-- kind: invariant -->
<!-- entities: secret reference, discovery result -->
<!-- enforced: src/secrets/list.ts#default -->
<!-- test: src/secrets/list.test.ts :: returns references and metadata but never encrypted or plain values -->
<!-- test: src/secrets/list.test.ts :: filters by namespace and escaped case-insensitive query -->

### Requirement: Store versioned encrypted entries

Setting a valid local reference SHALL persist an encrypted entry and return only its reference and version. Malformed destinations and empty values SHALL be rejected before writing.

#### Scenario: Replace an existing value
- **WHEN** a caller sets the same namespace/name twice successfully
- **THEN** the reference stays the same and the version increases from one to two.

#### Scenario: Preserve an existing entry
- **WHEN** a backend caller requests an insert with `ifAbsent` for an existing entry
- **THEN** the backend reports `created: false` and preserves the existing value and version.

<!-- id: secrets.put-local.versioned-upsert -->
<!-- entities: local secret, version -->
<!-- enforced: src/secrets/set.ts#default; src/secrets/parseRef.ts#default; src/secrets/putLocal.ts#default -->
<!-- test: src/secrets/localStore.test.ts :: inserts once and never overwrites an existing entry -->
<!-- test: src/secrets/localStore.test.ts :: persists encrypted values and binds namespace/name -->

### Requirement: Read mutable references from local storage

A get for a valid `secret://` reference SHALL read the entry visible in the caller's database snapshot without using the bootstrap cache or provider.

#### Scenario: No entry at the requested coordinates
- **WHEN** the requested namespace/name is absent, even with refresh enabled
- **THEN** get returns null rather than asking a provider.

<!-- id: secrets.get.local-reference -->
<!-- entities: local secret, reference -->
<!-- enforced: src/secrets/get.ts#default; src/secrets/getLocal.ts#default -->

### Requirement: Reuse successful bootstrap resolutions

For non-local references, get SHALL consult memory, then encrypted storage, then the bootstrap provider unless refresh is requested. Refresh SHALL bypass both lookups.

#### Scenario: Provider offline after memory reset
- **WHEN** a previously resolved bootstrap credential is requested with the same storage coordinates after memory is cleared, without refresh
- **THEN** get returns the persisted credential without contacting the provider.

<!-- id: secrets.get.bootstrap-cache -->
<!-- entities: bootstrap reference, local secret -->
<!-- enforced: src/secrets/get.ts#default -->
<!-- test: src/secrets/localStore.test.ts :: first bootstrap resolution is encrypted and survives memory reset -->

### Requirement: Interpret bootstrap references by scheme

The bootstrap resolver SHALL resolve valid `env://` names from the runtime environment, delegate `op://` reads to 1Password, preserve trimmed legacy literals and reject unsupported URI schemes.

#### Scenario: Absent environment entry
- **WHEN** a valid environment reference has no corresponding entry
- **THEN** the resolver returns null.

#### Scenario: Unknown scheme
- **WHEN** the resolver receives a `vault://` reference
- **THEN** it reports an unsupported provider instead of returning the reference as a literal.

<!-- id: secrets.resolve.provider-dispatch -->
<!-- entities: bootstrap reference, provider -->
<!-- enforced: src/secrets/resolve.ts#default -->
<!-- test: src/secrets/resolve.test.ts :: resolves env references -->
<!-- test: src/secrets/resolve.test.ts :: keeps legacy literals -->
<!-- test: src/secrets/resolve.test.ts :: rejects unknown providers -->

### Requirement: Complete saved prompts without returning the answer

A transient secure prompt with `saveAs` SHALL return only the stored reference on success. Accepted cancellation SHALL reject the pending prompt without storing an answer.

#### Scenario: Owner submits an accepted answer
- **WHEN** a prompt with a destination receives a valid answer
- **THEN** the prompt stores it with source `secure-input` and returns the resulting reference.

#### Scenario: Owner cancels the pending prompt
- **WHEN** the submission endpoint accepts cancellation for the exact pending prompt
- **THEN** it removes that prompt, acknowledges cancellation and rejects the waiter before the storage step.

<!-- id: secure-input.prompt.save-as -->
<!-- entities: secure prompt, destination reference -->
<!-- enforced: src/secureInput/prompt.ts#default; src/secureInput/submit.ts#default -->
<!-- test: src/secureInput/submit.test.ts :: saveAs encrypts via secrets.set and returns reference only; cancellation rejects and cleans -->

<!-- deferred: src/secrets/cache.unit.test.ts; src/secrets/encryptLocal.ts; src/secrets/decryptLocal.ts; src/secrets/localEncryptionKey.ts -->
<!-- uncertainty: External provider availability and key provisioning were not exercised. src/secureInput/request.ts delegates chat collection to the existing native-user-input capability; src/secrets/prompt.ts is a transient value-returning API, not a saved-reference API. -->
