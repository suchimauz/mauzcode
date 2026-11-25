# Plugin package lifecycle

## Purpose
Describe how the backend discovers plugin packages, distinguishes review from activation, and manages installed versions and their configuration.

<!-- Last verified: d35de7c2, 2026-11-22; source inspection only. -->

## Requirements

### Requirement: Current provider catalogue
The catalogue SHALL list current mounted providers in ID order and reject ambiguous IDs or handlers not owned by the declaring mount.

#### Scenario: Conflicting declarations
- **WHEN** two current providers declare the same ID
- **THEN** discovery fails instead of choosing one.

<!-- id: plugins.providers.ids -->
<!-- entities: provider, mount -->
<!-- enforced: src/plugins/providers.ts#ids -->
<!-- test: src/plugins/providers.test.ts :: duplicates malformed missing and foreign handlers fail closed -->

### Requirement: Read-only local discovery
Filesystem search SHALL match mounted package names, labels and descriptions case-insensitively and return metadata revisions rather than installable content pins.

#### Scenario: Catalogue selection submitted for copying
- **WHEN** filesystem materialization receives the mounted metadata revision returned by search
- **THEN** it rejects the selection instead of copying the mount.

<!-- id: plugins.filesystemSearch.revision -->
<!-- entities: mount, selection -->
<!-- enforced: src/plugins/filesystemSearch.ts#revision; src/plugins/filesystemMaterialize.ts#default -->
<!-- test: src/plugins/lifecycle.test.ts :: filesystem discovery is read-only; separately pinned inert copies reject stale sources -->

### Requirement: Validated package preview
An unconfirmed lifecycle request SHALL validate the staged package before returning a preview with a destination, digest, file diff and bounded source review, without replacing or loading the plugin.

#### Scenario: Valid fresh install
- **WHEN** an install candidate passes validation for an absent destination
- **THEN** the preview lists its files as additions and reports `preview` with activation false.

#### Scenario: Unsafe candidate
- **WHEN** a candidate contains a symbolic link or an install candidate claims an existing runtime namespace
- **THEN** the backend rejects the preview.

<!-- id: plugins.lifecycle.reviewFiles -->
<!-- entities: candidate, preview, destination -->
<!-- enforced: src/plugins/lifecycle.ts#reviewFiles; src/plugins/validateTree.ts#walk -->
<!-- test: src/plugins/lifecycle.test.ts :: dual provenance unsafe trees dependencies namespace collisions and shared lock -->

### Requirement: Digest-bound activation
A confirmed request SHALL require the digest for the current operation, selection, destination, candidate content and prior provenance before installing files and attempting runtime loading.

#### Scenario: Source changed since review
- **WHEN** the supplied digest describes the package before its content before its content changed
- **THEN** activation fails with a digest mismatch.

#### Scenario: Runtime loading fails after installation
- **WHEN** the loader throws after the candidate was moved into place
- **THEN** the files remain installed and the result reports `installed-load-failed` with activation false rather than success.

<!-- id: plugins.lifecycle.expectedDigest -->
<!-- entities: digest, selection, installed plugin -->
<!-- enforced: src/plugins/lifecycle.ts#opts.confirmed -->
<!-- test: src/plugins/lifecycle.test.ts :: truthful load failure and source change invalidates reviewed digest -->

### Requirement: Verified replacement and local rollback
Update and rollback SHALL require matching installed source provenance and an unchanged digest-verified tree. Rollback SHALL use the verified saved snapshot for the requested selection without fetching from its provider.

#### Scenario: Legacy provenance without a digest
- **WHEN** an update targets a legacy installation with no recorded content digest
- **THEN** the backend refuses automatic adoption.

#### Scenario: Previous revision requested offline
- **WHEN** a verified installation was updated and rollback to its saved revision is confirmed with a fresh matching digest while the provider is unavailable
- **THEN** the backend restores the saved package files.

<!-- id: plugins.lifecycle.previousSnapshot -->
<!-- entities: provenance, installed plugin, snapshot -->
<!-- enforced: src/plugins/lifecycle.ts#provenance -->
<!-- test: src/plugins/lifecycle.test.ts :: legacy locks without content digest refused; verified legacy path updates and rolls back offline -->

### Requirement: Local installation inventory
Inventory SHALL classify local installations from their package and provenance metadata, distinguishing unmanaged packages, legacy provenance, matching or modified managed trees, and invalid entries.

#### Scenario: Local files differ from the recorded digest
- **WHEN** inventory validates an otherwise valid installation and computes a different content digest
- **THEN** the plugin is listed as `modified` rather than `managed`.

<!-- id: plugins.installed.modified -->
<!-- entities: inventory, provenance -->
<!-- enforced: src/plugins/installed.ts#modified -->

### Requirement: Owned configuration metadata
Configuration lookup SHALL return only validated declared settings, secret descriptors and a widget name for the mounted plugin, without running the widget or returning secret values.

#### Scenario: No configuration declaration
- **WHEN** a mounted plugin omits its configuration declaration
- **THEN** lookup returns empty settings and secrets and a null widget.

#### Scenario: Foreign secret namespace
- **WHEN** a secret descriptor references a namespace not owned by the plugin
- **THEN** lookup rejects the declaration.

<!-- id: plugins.configuration.result -->
<!-- kind: invariant -->
<!-- entities: mounted plugin, setting, widget, secret descriptor -->
<!-- enforced: src/plugins/configuration.ts#result -->
<!-- test: src/plugins/configuration.test.ts :: separate secrets use safe metadata only and require namespace ownership -->

### Requirement: Validate configuration changes before writing
Configuration saves SHALL reject invalid submitted settings before applying any setting change; resets SHALL target one declared setting and cannot be combined with values.

#### Scenario: Invalid numeric value
- **WHEN** a save includes a non-numeric value for a numeric setting
- **THEN** the save fails without writing any setting.

<!-- id: plugins.saveConfiguration.reset -->
<!-- entities: setting, configuration save -->
<!-- enforced: src/plugins/saveConfiguration.ts#default -->
<!-- test: src/plugins/configuration.test.ts :: full validation precedes writes including omitted booleans -->

<!-- uncertainty: Validation before writing does not establish transactional recovery from a later storage failure. -->
<!-- deferred: src/plugins/dispatch.ts; provider-specific transport and runtime loader internals. -->
