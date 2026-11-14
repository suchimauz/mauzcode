## Purpose

Retire the legacy llm, llms and node runtime so that it is kept as source for later salvage but is never loaded, called or routed, and move existing active agents and borrowed settings onto the models stack.

## ADDED Requirements

### Requirement: Legacy namespaces are not loaded
The runtime SHALL NOT load the `llm`, `llms` or `node` namespaces, their settings, routes, compactors or start hooks. Their HTTP endpoints, including `/node/v1/*` and the legacy LLM settings and usage pages, MUST be unavailable. Their source MAY remain in the repository outside scanned roots. Already applied database migrations and legacy tables MUST be left intact.

#### Scenario: Runtime after startup
- **WHEN** the server starts
- **THEN** no `llm`, `llms` or `node` procedure is registered and requests to `/node/v1/models` are not found

#### Scenario: Migrations stay consistent
- **WHEN** pending migrations run after the legacy code is unloaded
- **THEN** they complete without error and the legacy tables still exist

### Requirement: No calls into legacy namespaces
Loaded project and official plugin code SHALL contain no calls to `ctx.fns.llm.*`, `ctx.fns.llms.*` or `ctx.fns.node.*`, and the project quality check MUST report no calls to missing procedures. An automated test MUST fail when such a call is introduced.

#### Scenario: Reintroduced legacy call
- **WHEN** a loaded source file calls `ctx.fns.llm.call`
- **THEN** the guard test fails and names the file

### Requirement: Active agents are migrated
A migration owned by the agent module SHALL rewrite the model of every non-archived agent, and the stored last-used model (`kv` key `last-model`), from its legacy route to a model route. The model id is kept. Previous values MUST be backed up, reverting the migration MUST restore them, and the migration MUST run after the model-owned unique connection index migration.

#### Scenario: Codex over SSH
- **WHEN** an active agent has `ssh/aeza-criminal-amarant:codex/su4imauz:gpt-6-astra`
- **THEN** after migration its model is `codex/su4imauz:gpt-6-astra`

#### Scenario: Claude Code account without a connection
- **GIVEN** only the claude connection `2yfl55fsh` exists
- **WHEN** an active agent has `ssh/aeza-criminal-amarant:claude-code/brailyndaishaun14091998:claude-opus-5-5`
- **THEN** after migration its model is `claude/2yfl55fsh:claude-opus-5-5`

#### Scenario: No target connection
- **GIVEN** no kimi connection exists
- **WHEN** an active agent has `kimi-coding/a:kimi-k2`
- **THEN** its model is unchanged, the migration logs it, and its next run fails with `LEGACY_ROUTE`

#### Scenario: Last-used model
- **WHEN** `last-model` holds `ssh/aeza-criminal-amarant:claude-code/brailyndaishaun14091998:claude-opus-5-5`
- **THEN** after migration it holds `claude/2yfl55fsh:claude-opus-5-5`, and reverting restores the old value

#### Scenario: Revert
- **WHEN** the migration is reverted
- **THEN** every migrated agent has its previous model again

### Requirement: Legacy route mapping rules
Codex routes SHALL map to the codex connection with the same account name, or else the first codex connection. Claude Code, Anthropic and Anthropic OAuth routes map to the first claude connection. "First" means the earliest `created_at`, ties broken by `id`. Every other route, and any route whose target connection does not exist, MUST be left unchanged and logged.

#### Scenario: First connection
- **GIVEN** two codex connections and no account-name match
- **WHEN** a codex agent is migrated
- **THEN** it maps to the connection with the earliest `created_at`

### Requirement: Legacy account surfaces are retired
Settings status SHALL report only environment key presence and MUST NOT query legacy OAuth or login state; connection state comes from model connections. The legacy LLM connections bridge and its settings panels MUST NOT be loaded.

#### Scenario: Settings status
- **WHEN** the settings status is requested
- **THEN** it returns environment key flags without calling any `llm` procedure

### Requirement: Archived agents stay on legacy routes
Archived agents SHALL NOT be migrated. When an archived agent is restored and runs, it MUST fail with `LEGACY_ROUTE` until the owner chooses a model.

#### Scenario: Restore an archived agent
- **WHEN** an archived agent with `anthropic-oauth/whims-hue_7v:claude-opus-5-5` is restored and run
- **THEN** the run fails with `LEGACY_ROUTE` and no provider request is sent

#### Scenario: Owner picks a model
- **WHEN** the owner sets a resolvable model on that restored agent
- **THEN** its next run proceeds through the chosen connection

### Requirement: Borrowed secret settings are relocated
Modules that read API keys from legacy `llm` settings SHALL read their own settings instead: OpenAI embeddings and the OpenAI decision engine read an OpenAI key in their module, and the jev engine and jev health read an OpenRouter key in the jev module. A migration MUST copy existing secret references to the new keys without exposing their values.

#### Scenario: Embeddings after migration
- **GIVEN** an OpenAI key reference was stored under the legacy setting
- **WHEN** embeddings are requested after migration
- **THEN** they authenticate with the same key read from the embeddings module setting
