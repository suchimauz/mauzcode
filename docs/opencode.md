# OpenCode Go and Console inference

## Models provider (current architecture)

The optional official `plugins/opencode-go` plugin registers provider `opencode-go` in Models. Enable the plugin and create a Models connection with its required secret `apiKey` field. Supported transports are direct, SOCKS and SSH tunnel. Agent model references use `opencode-go/<account>:<model-id>`. This provider is Go-only: it never switches to PAYG or another provider.

Discovery reads `/inference/go/v1/models` and retains tool-capable chat models. Native protocol, context/output limits and reasoning capabilities are taken from discovery metadata. The plugin declares an SDK `ProviderDefinition.route`; core Models performs the normal input/capability checks and dispatches through shared Chat Completions, Responses, Anthropic Messages or Gemini adapters using the connection-bound transport. Plugins do not call the private protocol registry. An uncached model uses the Go Chat Completions translation endpoint.

Reasoning wire values are metadata-driven (`none` → off; native `max` → xhigh when xhigh is not advertised). Auto without a reported default omits reasoning settings. Anthropic off uses the thinking toggle only when supported; Gemini thinking levels are restricted to low/medium/high. Existing providers with defaults retain their behavior.

Inference requests carry a truthful `MauzCode/opencode-go` user agent and the stable session id as `x-opencode-session`. Authentication stays in the connection's secret store. Usage and connection health use the authenticated `/inference/go/v1/usage` endpoint; usage reports 5-hour, weekly and monthly windows, not PAYG budgets. Errors must not be displayed as zero consumption. Prices use the `opencode-go` models.dev vendor.

The current integration has no automatic migration from legacy `llm.opencode*` settings. The historical live checks below are evidence for the legacy implementation, **not** a live verification of the new Models plugin. The new plugin was separately verified through the public Models facade using an owner-authorized direct connection: discovery returned 30 models; authenticated health and all three usage windows succeeded. Minimal streaming requests returned `OK` through all four native protocols: `glm-5.3-flash` (Chat Completions), `gpt-5.6-luna` (Responses), `qwen3.8-flash` (Anthropic) and `gemini-4-argon` (Gemini). No privacy or billing-mode settings were changed. These are smoke checks, not exhaustive per-model certification; catalogue and quota values can change.

## Legacy implementation and historical checks

The following describes the earlier `llm` implementation, retained as reference; these settings do not configure the Models plugin above.

Configure `llm.opencodeApiKey` with an encrypted secret reference. `llm.opencodePlan` selects **go** (subscription, `/inference/go`) or **payg** (credit-funded, `/inference`). The current user's choice is **Go**. No automatic switch between billing modes or fallback to another provider. `llm.opencodeInstance` is empty/local for direct access or the name of a pinned SSH instance. Keys travel in encrypted bridge input and are not persisted remotely.

## Routing and sessions

Official plan-specific endpoint tables are authoritative:
- https://opencode.ai/v2/docs/console/go#endpoints
- https://opencode.ai/v2/docs/console/models#endpoints

Each documented model routes to Chat Completions, Responses, Anthropic Messages or native Gemini. The public table is intersected with `/inference[/go]/v1/models`; its payload contains IDs, not efforts or quota. models.dev (`opencode-go` or `opencode`) supplies optional limits and reasoning metadata, never overrides the documented route. Missing optional metadata does not remove a documented model. Cache is scoped to plan and credential fingerprint. Connections has a force-refresh action.

Requests carry truthful User-Agent MauzCode/OpenCode and stable `x-opencode-session`: agent ID for streaming conversations, explicit session ID or a UUID generated once before retries for standalone calls. No official-client impersonation. Go URLs cannot fall back to PAYG. Gemini streams at `:streamGenerateContent?alt=sse`; its adapter preserves native function calls, function responses and opaque thought signatures across tool turns. MauzCode Node relaying of this mixed-protocol provider is not advertised; pinned SSH egress is supported.

Efforts come from metadata, not model-name guesses. `auto` omits settings because the upstream default is unknown. `none` maps to MauzCode off; xhigh maps to max only when max is advertised without xhigh. The current picker cannot distinguish both xhigh and max as separate choices. Arbitrary thinking-token budgets are not exposed. Gemini thinking settings are emitted only for exact native metadata, not guessed from OpenAI effort names.

PAYG documented public chat rows are not blanket-hidden after one FreeTierError; actual service restrictions still apply. Public chat without a key requires a cached documented public model. Go always requires a key. SystemOne's non-chat question API remains outside the agent LLM interface.

## Usage

**Go:** authenticated `GET /inference/go/v1/usage` returns `{usage:{rolling,weekly,monthly}}`, each with `{status:"ok"|"rate-limited",percent:number,resetsAt:ISO8601}`. Both this endpoint and legacy `/zen/go/v1/usage` returned HTTP 200 with identical JSON in live read-only checks; MauzCode uses only the V2 endpoint. Percent is **used**, so remaining is `clamp(100-percent,0,100)` (rate-limited means exhausted). Integer rounding can hide fractional spend. Quota is shared across paid models with model-dependent normalized costs, not three independent per-model budgets. Server reset timestamps are authoritative; monthly `windowMinutes=43200` is only a display category, not a fixed reset calculation. Normal refreshUsage/recordUsage/usageOverview caching and desktop/mobile quota windows now apply to Go too. Errors never become zero usage; expired windows are hidden until refreshed. Pinned SSH egress supports the same exact authenticated GET. PAYG member budgets are never substituted for Go allowance. Selecting Go does not change Console extra-usage settings.

**PAYG:** `/console/api/v1/budgets/members` reports monthly member spend/cap, not prepaid credits. Only a single unambiguous row is displayed; member emails/IDs are never returned to UI. `limit=null` means no member spending cap, not unlimited funds. Public prepaid balance API was not found.

## Verification with the configured key

- Go catalogue: HTTP 200, 28 documented selectable routes at test time (counts may change).
- Go GLM Chat completion: HTTP 200, `OK`; also HTTP 200 through pinned SSH.
- Go Qwen Anthropic completion: HTTP 200, `OK`.
- Go GLM streaming: native echo function call parsed with `{text:"OK"}`; no real side-effect tool executed.
- Gemini Contributor native request reached the endpoint but was refused by the workspace privacy policy: allowing this model would permit training on request data. Privacy settings were **not** changed. Gemini JSON/SSE, tools, signatures and errors are tested with fixtures.
- Previous PAYG HTTP 402 was lack of PAYG funds, not evidence that the Go subscription was unusable.

References:
- https://opencode.ai/v2/docs/console/api/inference/
- https://opencode.ai/v2/docs/console/harnesses
- https://opencode.ai/v2/docs/console/api/budgets/
- https://models.dev/api.json
