## Why

The 84 files in `src/models` mix provider protocols, connection persistence, transport, inference, catalogue operations, public types and registration infrastructure. Responsibility boundaries are difficult to navigate, and moving files without accounting for runtime namespaces would break callers and hot reload.

## What Changes

- Organize implementation procedures into `connections`, `transport`, `inference`, `catalog`, and `provider/{claude,codex,custom}` namespaces, retaining one procedure per file.
- Preserve existing root procedure names through typed compatibility facades where implementation moves; keep public types and registration infrastructure at their existing paths.
- Define an exhaustive file disposition and consumer/test inventory before implementation.
- Establish dependency rules, explicit namespace reload sequencing, cold-boot checks and incremental rollback steps.
- Add compatibility and architecture tests without changing model behavior, HTTP contracts, storage or UI.
- This change's current deliverable is the specification only. Implementation tasks remain unchecked pending separate authorization.

## Capabilities

### New Capabilities

- `models-module-boundaries`: Stable public model contracts backed by responsibility-focused internal runtime namespaces, including discovery, reload and dependency guarantees.

### Modified Capabilities

None. Existing `llm-provider-sdk`, `llm-connections`, `llm-network-transport`, `llm-model-cache`, `llm-model-availability`, provider-specific and `models-settings-ui` requirements remain unchanged; they are regression constraints, not behavioral deltas.

## Impact

- Implementation locations under `src/models`, selected internal call sites, model test fixtures, generated type declarations and developer documentation.
- Existing `ctx.fns.models.*`, `types.models.*`, provider ids, HTTP endpoints, permission/CSRF checks and error contracts remain compatible.
- No database migration, credential relocation, package dependency, UI redesign or framework-loader rewrite.
- Current loader behavior requires explicit loading of nested procedures; loading `models` alone is not a recursive subtree reload.
- External plugins need no migration. No commit, push or runtime implementation is included in specification preparation.
