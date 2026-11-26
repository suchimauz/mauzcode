/**
 * Stream one inference turn through a model connection's provider
 *
 * Inference entry point of the models stack. Re-checks on every call that the connection and model are enabled (models.assertModelEnabled; fails MODEL_DISABLED_BY_USER or CONNECTION_DISABLED without any network request), then calls the provider's stream operation with the connection bound to its saved transport. Fails UNSUPPORTED when the provider declares neither stream nor route; route providers stream through the shared protocol they select (models.inference.streamRoute). Before the provider runs (and before any network request) it validates SDK input with models.checkInput (cancellation, checkpoint identity, continuation-state binding to provider/connection/session/run) and, for providers declaring capabilities.reasoning, normalizes reasoningEffort with models.resolveReasoning from cached model metadata or the provider's documented profile (protocol-route providers skip it for models cached without reasoning metadata and without a profile). Returns text, reasoning summary, tool calls, token usage, finish reason and, when supported, run-scoped continuation state, quota observations and requested/applied reasoning. Agents still use llm.stream; use this for models connections.
 * For a model whose cached metadata declares `reasoning.variants`, the preference is normalized against the levels of members the owner has not disabled — or, for providers declaring `capabilities.groupAvailability` (Antigravity), of all provider-eligible members of an enabled group, since legacy member disables do not remove levels there (models.catalog.effectiveDisabled) — (auto uses the declared default member when eligible, else the first eligible member in provider order) and the provider receives that member's native id as `model` with no reasoning or effort field; the result still reports requested and applied. Such a route with no eligible member, and any model absent from the cached catalogue of a provider declaring `capabilities.variantCatalogue` (including a cold cache), fails MODEL_UNAVAILABLE (invalid_input, acceptance none, not retryable, replay-safe) before any provider request and without discovery.
 * @param opts.connectionId Model connection UUID.
 * @param opts.model Provider-native model id on the connection.
 * @param opts.instructions Effective system instructions.
 * @param opts.messages Ordered input: OpenAI-shaped chat messages and, for checkpoint-capable providers, checkpoint entries.
 * @param opts.cacheableMessageCount Number of leading cacheable messages, excluding transient guidance. @minimum 0
 * @param opts.tools Provider-neutral tools converted to wire declarations by the provider.
 * @param opts.reasoningEffort Reasoning effort such as low, medium, high or off.
 * @param opts.onEvent Receives incremental text, reasoning and tool-argument deltas.
 * @param opts.sessionId Stable session or agent id for request correlation; prompt cache identity when promptCacheKey is absent.
 * @param opts.promptCacheKey Caller-owned prompt cache identity, e.g. shared by sessions with inherited history.
 * @param opts.runId Caller-owned logical run id; required for continuation state.
 * @param opts.state Continuation state returned by the previous request of the same run.
 * @param opts.signal Cancels the provider request.
 * @param opts.temperature Sampling temperature; dropped unless the provider declares capabilities.sampling. @minimum 0 @maximum 2
 * @param opts.maxTokens Output token budget; dropped unless the provider declares capabilities.sampling. @minimum 1
 * @param opts.responseFormat Structured output request; dropped unless the provider declares capabilities.structuredOutput.
 * @param opts.providerOptions Provider-specific options passed unchanged.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model connection UUID. */
        connectionId: string;
        /** Provider-native model id on the connection. */
        model: string;
        /** Effective system instructions. */
        instructions: string;
        /** Ordered input: OpenAI-shaped chat messages and, for checkpoint-capable providers, checkpoint entries. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
        /** Number of leading cacheable messages, excluding transient guidance. @minimum 0 */
        cacheableMessageCount?: number;
        /** Provider-neutral tools converted to wire declarations by the provider. */
        tools?: types.models.ToolSpec[];
        /** Reasoning effort such as low, medium, high or off. */
        reasoningEffort?: string;
        /** Receives incremental text, reasoning and tool-argument deltas. */
        onEvent?: (event: types.models.StreamEvent) => void;
        /** Stable session or agent id for request correlation; prompt cache identity when promptCacheKey is absent. */
        sessionId: string;
        /** Caller-owned prompt cache identity, e.g. shared by sessions with inherited history. */
        promptCacheKey?: string;
        /** Caller-owned logical run id; required for continuation state. */
        runId?: string;
        /** Continuation state returned by the previous request of the same run. */
        state?: types.models.ProviderState;
        /** Cancels the provider request. */
        signal?: AbortSignal;
        /** Sampling temperature; dropped unless the provider declares capabilities.sampling. @minimum 0 @maximum 2 */
        temperature?: number;
        /** Output token budget; dropped unless the provider declares capabilities.sampling. @minimum 1 */
        maxTokens?: number;
        /** Structured output request; dropped unless the provider declares capabilities.structuredOutput. */
        responseFormat?: types.models.ResponseFormat;
        /** Provider-specific options passed unchanged. */
        providerOptions?: Record<string, unknown>;
    },
): Promise<types.models.StreamResult> {
    const view = await ctx.fns.models.inference.assertModelEnabled({ id: opts.connectionId, model: opts.model });
        const def = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider]!.definition : undefined;
        if (!def?.stream && !def?.route) throw Object.assign(new Error("Provider " + view.provider + " does not support stream"), { code: "UNSUPPORTED", status: 400, retryable: false });
        ctx.fns.models.inference.checkInput({ provider: view.provider, connectionId: view.id, model: opts.model, sessionId: opts.sessionId, capabilities: def.capabilities, messages: opts.messages, runId: opts.runId, state: opts.state, signal: opts.signal });
        if (def.capabilities?.reasoning && opts.reasoningEffort !== undefined && !["auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(opts.reasoningEffort)) {
            throw ctx.fns.models.inference.failure({ message: "Invalid reasoning effort", status: 400, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
        }
        let reasoning: types.models.ReasoningResolution | undefined;
        let info: types.models.ModelInfo | undefined;
        const codex = view.provider === "codex";
        const dispatch = ctx.state.models?.codexDispatch?.get(opts);
        let generation: string | null = null;
        if (def.capabilities?.reasoning || def.route || codex) {
            // Read the existing catalogue cache only; inference never triggers model discovery.
            const rows = await ctx.fns.procs.db.select({ sql: codex ? "SELECT codex_generation, CASE WHEN models_cache_generation=codex_generation THEN models_cache END AS models_cache FROM llm_connections WHERE id=?" : "SELECT models_cache FROM llm_connections WHERE id=?", params: [view.id] }) as { models_cache: unknown; codex_generation?: string | null }[];
            generation = rows[0]?.codex_generation ?? null;
            const cache = typeof rows[0]?.models_cache === "string" ? JSON.parse(rows[0].models_cache) : rows[0]?.models_cache;
            info = Array.isArray(cache) ? (cache as types.models.ModelInfo[]).find(m => m?.id === opts.model) : undefined;
        }
        let explicitGeneration: string | null | undefined;
        let codexOptions: Record<string, unknown> | undefined;
        if (codex) {
            const controls = ctx.fns.models.provider.codex.codexControls({ options: opts.providerOptions, model: info });
            if (controls.service_tier || controls.verbosity) explicitGeneration = generation;
            codexOptions = controls.service_tier || controls.verbosity ? { ...(controls.service_tier ? { speed: controls.service_tier === 'priority' ? 'fast' : 'ultrafast' } : {}), ...(controls.verbosity ? { verbosity: controls.verbosity } : {}) } : undefined;
            if (dispatch?.pin && dispatch.pin.generation !== undefined && dispatch.pin.generation !== generation) throw ctx.fns.models.inference.failure({ message: "Codex account changed before retry", status: 409, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
            if (info?.reasoningUnavailable) throw ctx.fns.models.inference.failure({ message: "Catalogue provides no usable reasoning level", status: 400, info: { code: "CAPABILITY_UNAVAILABLE", classification: "capability_unavailable", acceptance: "none", retryable: false, replaySafe: true } });
            await ctx.fns.models.provider.codex.codexCheckOpaque({ connectionId: view.id, messages: opts.messages, state: opts.state });
        }
        // Variant-backed levels select a native member id here, in the SDK, so every provider sees one exact model and no effort.
        let model = opts.model;
        let variant = false;
        if (def.capabilities?.variantCatalogue || info?.reasoning?.variants) {
            const unavailable = (why: string) => ctx.fns.models.inference.failure({ message: `Model ${view.provider}/${view.accountName}:${opts.model} is unavailable: ${why}; choose a model`, status: 409, info: { code: "MODEL_UNAVAILABLE", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
            // Validated cache projection with owner disables applied; never a provider request.
            const catalogue = await ctx.fns.models.catalog.listModels({ id: view.id, cacheOnly: true });
            info = catalogue.source === "provider" ? catalogue.models.find(m => m.id === opts.model) : undefined;
            if (!info && def.capabilities?.variantCatalogue) throw unavailable(catalogue.source === "provider" ? "it is not in the connection's current catalogue" : "the connection has no current catalogue (sign in or refresh its models)");
            const variants = info?.reasoning?.variants;
            if (variants) {
                const live = variants.members.filter(m => !m.disabled);
                if (!live.length) throw unavailable("every variant is disabled or removed");
                const preferred = live.find(m => m.id === variants.default) ?? live[0]!;
                reasoning = ctx.fns.models.inference.resolveReasoning({ model: opts.model, preference: opts.reasoningEffort, metadata: { supported: live.map(m => m.level), default: preferred.level } });
                // One logical call keeps its member across retries; a member that stopped being eligible is never reused.
                const pin = (ctx.state.models as typeof ctx.state.models & { variantPins?: WeakMap<object, { member?: string }> } | undefined)?.variantPins?.get(opts);
                const pinned = pin?.member ? live.find(m => m.id === pin.member) : undefined;
                if (pinned && pinned.level !== reasoning.applied) reasoning = { ...reasoning, applied: pinned.level };
                model = pinned?.id ?? live.find(m => m.level === reasoning!.applied)!.id;
                if (pin) pin.member = model;
                variant = true;
            }
        }
        // Protocol-route providers are discovery-driven: a model reported without reasoning controls (and no profile)
        // streams without a reasoning setting instead of failing CAPABILITY_UNAVAILABLE.
        const profile = def.capabilities?.reasoning ? def.reasoningProfile?.(ctx, opts.model) ?? null : null;
        if (!variant && def.capabilities?.reasoning && !(def.route && !info?.reasoning && !profile)) {
            reasoning = ctx.fns.models.inference.resolveReasoning({ model: opts.model, preference: opts.reasoningEffort, metadata: info?.reasoning ?? null, profile });
        }
        opts.signal?.throwIfAborted();
        const { view: resolvedView, definition, conn } = await ctx.fns.models.connections.resolve({ id: view.id, signal: opts.signal, timeoutMs: 1800000, headerTimeoutMs: 300000, idleTimeoutMs: 300000 });
        ctx.fns.models.inference.watchTransport({ conn, signal: opts.signal });
        let capture: ((calls: types.models.StreamResult['toolCalls']) => void) | undefined;
        if (ctx.state.models?.nativeSearchOrigins?.has(opts)) {
            (ctx.state.models.nativeSearchInference ??= new WeakMap()).set(conn, { request: opts, view: resolvedView });
            capture = ctx.fns.models.nativeSearch.capture({ conn, model: opts.model });
        }
        const { connectionId: _c, temperature, maxTokens, responseFormat, ...caller } = opts;
        // A variant request names the member and carries neither the preference nor a resolved level.
        const { reasoningEffort: _e, ...bare } = caller;
        const rest = variant ? { ...bare, model } : caller;
        // Capability gating: a provider never sees options it did not opt into.
        const gated = {
            ...(def.capabilities?.sampling && temperature !== undefined ? { temperature } : {}),
            ...(def.capabilities?.sampling && maxTokens !== undefined ? { maxTokens } : {}),
            ...(def.capabilities?.structuredOutput && responseFormat !== undefined ? { responseFormat } : {}),
        };
        const req: types.models.StreamRequest = reasoning && !variant ? { ...rest, ...gated, reasoning } : { ...rest, ...gated };
        if (codex) {
            req.providerOptions = codexOptions;
            ((ctx.state.models ??= {}).codexDispatch ??= new WeakMap()).set(req, { ...dispatch, generation: explicitGeneration });
        }
        const result = definition.stream
            ? await definition.stream(ctx, conn, req)
            : await ctx.fns.models.inference.streamRoute({ definition, conn, req, info: info ?? null });
        capture?.(result.toolCalls);
        if (result.state && (!def.capabilities?.continuationState || result.state.provider !== view.provider || result.state.connectionId !== view.id || result.state.sessionId !== opts.sessionId || result.state.runId !== opts.runId)) delete result.state;
        const applied = variant ? reasoning : req.reasoning;
        return applied ? { ...result, reasoning: applied } : result;
}
