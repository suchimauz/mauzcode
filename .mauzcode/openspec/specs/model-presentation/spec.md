# model-presentation Specification

## Purpose
Define how MauzCode presents models to people: one human-readable name per model route and one brand mark per model or provider, identical on every UI surface (pickers, navigation, chat header, quotas, settings).

## Requirements

### Requirement: Human-readable model names
Every UI projection of a model route (pickers, new session and its usage statistics, chat list and header, model-change events, sidebar draft, Models settings lists) SHALL show the same display name: the connection catalogue label; else the models.dev name for the exact id (price vendor first, then any vendor, without a trailing "(latest)"/"(preview)"); else a prettified id. An `ssh/<host>:` prefix MUST NOT change the name, and names MUST NOT affect routing.

#### Scenario: Claude model
- **WHEN** a claude connection lists `claude-opus-4-5`
- **THEN** the picker, chat list and chat header show "Claude Opus 4.5"

#### Scenario: Provider label is kept
- **WHEN** the codex catalogue returns the label "GPT-6-Sol" for `gpt-6-sol`
- **THEN** that label is shown unchanged

#### Scenario: Custom connection model
- **WHEN** a custom connection lists `gemma4-26b`
- **THEN** its models.dev name is shown when one exists, otherwise the prettified "Gemma4 26b"

#### Scenario: Catalogue unavailable
- **WHEN** models.dev has never been fetched successfully
- **THEN** models still show prettified names such as "GPT-5.1 Codex Mini" and "GLM-4.6", and the UI does not fail

#### Scenario: Model outside the catalogue
- **WHEN** an agent keeps a route whose model is no longer listed
- **THEN** its chat shows the name from the same resolver

#### Scenario: Route with an SSH host prefix
- **WHEN** an agent keeps the route `ssh/box:codex/acc:gpt-5.1-codex-mini`
- **THEN** it is shown as "GPT-5.1 Codex Mini", the same name as without the prefix

#### Scenario: New-session usage statistics
- **WHEN** the welcome screen lists model usage and the favorite model
- **THEN** each model is shown by its display name, and routes that share one display name are counted as one model

#### Scenario: Model change in the transcript
- **WHEN** an agent's model changes from `claude/a:claude-opus-4-5` to `codex/b:gpt-5`
- **THEN** the lifecycle row shows "Claude Opus 4.5 → GPT-5", and falls back to the raw routes when naming fails

#### Scenario: Browser-tab sidebar draft
- **WHEN** a sidebar draft page shows the default model
- **THEN** it shows that model's display name and mark, with the raw route only as a tooltip

#### Scenario: Settings model list for every provider
- **WHEN** the owner opens the model list of a claude, codex or custom connection in Settings → Models
- **THEN** every model row shows its display name next to the model id, not only rows whose provider returned a label

### Requirement: Unified model and provider marks
Model and provider marks SHALL come from one server-side resolver. For a model it SHALL use the brand recognised from the model id; otherwise the brand of the connection provider (claude → Anthropic, codex → OpenAI); otherwise a generic plug icon. For a provider alone it SHALL use the provider brand, or the generic plug for custom and unknown providers. A chat's own custom icon still takes precedence.

#### Scenario: Quota cards
- **WHEN** the navigation shows quota cards for claude and codex accounts
- **THEN** they show the Anthropic and OpenAI marks, the same as in the model picker

#### Scenario: Same model, same mark
- **WHEN** one model route appears in the picker, the chat list and the chat header
- **THEN** all three show the same mark

#### Scenario: Custom connection with a known model family
- **WHEN** a custom connection serves `gemma4-26b`
- **THEN** its mark is the Google mark

#### Scenario: Custom connection with an unknown model
- **WHEN** a custom connection serves a model with no recognised brand
- **THEN** its mark is the generic plug icon

### Requirement: Provider-qualified selected model in chat
The chat's selected-model control SHALL visibly show both the shared human-readable model name and its connection provider, without requiring the picker to be opened or a tooltip to be hovered. Provider identity MUST describe the route's provider, not a brand inferred from the model name. The control's accessible text MUST include both. Presentation MUST NOT alter the stored route or shared model name.

#### Scenario: Selected model caption
- **WHEN** a chat has a selected model from a codex connection
- **THEN** its closed model control displays the human-readable model name and `codex`

#### Scenario: Same model through different providers
- **WHEN** the owner switches between routes with the same model display name but different providers
- **THEN** the selected-model provider caption updates to identify the selected route's provider

#### Scenario: Custom provider serving another brand
- **WHEN** a custom connection serves a model whose name identifies another vendor
- **THEN** the provider caption identifies `custom`, not the vendor inferred from the model name

#### Scenario: Previously selected model becomes disabled
- **WHEN** the selected model or its connection is disabled and the catalogue is refreshed
- **THEN** the closed chat control retains the current model name and provider without silently switching the stored route, while the disabled route is absent from picker choices

#### Scenario: Selected route missing from catalogue
- **WHEN** the current route has no matching catalogue entry
- **THEN** the chat still shows the shared fallback model name and provider obtained from the route

### Requirement: Request-based model usage statistics
New Session SHALL rank models and select the favorite by the number of completed requests with a recorded model within the selected period and owner scope. It SHALL group routes by their shared display name, count a request even when its token usage is unavailable, and MUST NOT infer a historical model from the session’s current selection. Requests without a recorded model SHALL be omitted from model rankings and charts without removing activity or measured tokens from overall totals.

#### Scenario: The session model changes or is cleared
- **WHEN** a session records two requests for model A and one for model B in the selected period, and its current model is later changed or cleared
- **THEN** the list counts two requests for A and one for B, and A is the favorite regardless of the current selection

#### Scenario: Request count is independent of token coverage
- **WHEN** two requests for model A have no token measurements and one request for model B has measured usage
- **THEN** A is the favorite, and its unavailable token usage is not reported as zero

#### Scenario: Known and unknown models in the same period
- **WHEN** one request for A has 10 measured tokens and three requests without a recorded model have 30 measured tokens in total
- **THEN** the overview includes all 40 tokens, the model list and chart attribute only 10 to A, and A is the favorite

#### Scenario: No attributed requests in the selected period
- **WHEN** the selected period contains messages and measured usage but no requests with a recorded model
- **THEN** the overview retains those totals, Favorite model displays `—`, and the model list and chart contain no entry for `null` or any other placeholder
