/**
 * Resolve one voice route against current registrations and stored connections
 *
 * Use through voice.resolveRoute to obtain the connection identity, the destination disclosure of that exact
 * connection, the catalogued model with its capabilities and the sample rate core negotiates. Checks run in order
 * without any fallback: exact route grammar, then provider registration, then the stored connection of that
 * provider with this exact account name, then the model inside the provider catalogue (static declarations plus a
 * contract `listModels` discovery when the static list does not name it). A failure throws with
 * `code: "unconfigured"` only when nothing was selected — here always `code: "routeUnavailable"` — and a closed
 * `reason`; the caller must report that unavailability instead of trying another route. Reads no secrets and
 * never opens a provider session. Errors carry fixed text: a route string can embed a credential-bearing URL and
 * provider payloads are untrusted, so neither is ever echoed back. Every discovered model is validated against the
 * SDK contract and reduced to a known-fields projection before use; a discovery that throws becomes
 * `catalogue-failed`.
 * @param opts.route Exact provider/accountName:modelId route to resolve.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact provider/accountName:modelId route to resolve. */
        route: string;
    },
): Promise<types.voice.ResolvedRoute> {
    if (typeof opts.route !== "string" || !opts.route.trim()) {
        throw ctx.fns.voice.route.failure({
            code: "unconfigured",
            message: "No voice route is configured; choose a voice model.",
            reason: "not-selected",
        });
    }
    const parsed = ctx.fns.voice.route.parseRoute({ route: opts.route });
    // Builds the fixed, credential-free failure; callers throw it explicitly.
    const fail = (reason: "unknown-provider" | "unknown-connection" | "unknown-model" | "catalogue-failed"): Error =>
        ctx.fns.voice.route.failure({ message: "This voice route is not available; choose a voice model.", reason });
    const entry = Object.hasOwn(ctx.state.voice?.providers ?? {}, parsed.provider) ? ctx.state.voice!.providers![parsed.provider] : undefined;
    if (!entry) throw fail("unknown-provider");
    const definition = entry!.definition;
    const connections = await ctx.fns.voice.connections.list({ provider: parsed.provider });
    const connection = connections.find(view => view.accountName === parsed.accountName);
    if (!connection) throw fail("unknown-connection");
    // Public destination projection of this exact connection (its per-connection disclosure, else the static
    // declaration, already sanitized by toView): only kind and label survive, and reading an untrusted
    // declaration cannot escape this function with a throw.
    const destination = ((): types.voice.Destination => {
        try {
            const source = connection!.destination ?? definition!.destination;
            return { kind: source.kind, label: source.label };
        }
        catch { throw fail("unknown-provider"); }
    })();
    // Model catalogue per the SDK contract: declared static models first, then provider discovery when the
    // route names a model the static list does not carry. Discovery sees only the non-secret connection and
    // must not be sent user audio. Catalogue entries are untrusted provider data: each one is validated against
    // the SDK rules and reduced to a known-fields projection before use, so foreign enumerable fields are
    // dropped and a throwing getter contributes a malformed entry instead of escaping the fixed errors.
    const KNOWN_FLAGS = ["languages", "keywords", "prompt", "delay"] as const;
    const safeModel = (candidate: unknown): types.voice.VoiceModel | null => {
        try {
            if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
            const raw = candidate as Record<string, unknown>;
            if (typeof raw.id !== "string" || !raw.id.trim() || raw.id.length > 200) return null;
            if (raw.label !== undefined && typeof raw.label !== "string") return null;
            if (raw.description !== undefined && typeof raw.description !== "string") return null;
            const source = raw.capabilities;
            if (!source || typeof source !== "object" || Array.isArray(source)) return null;
            const caps = source as Record<string, unknown>;
            if (caps.turnDetection !== "client" && caps.turnDetection !== "server") return null;
            const rates = caps.sampleRates;
            if (!Array.isArray(rates) || !rates.length ||
                rates.some(rate => typeof rate !== "number" || !Number.isInteger(rate) || rate <= 0) ||
                new Set(rates).size !== rates.length) return null;
            for (const flag of KNOWN_FLAGS) {
                if (caps[flag] !== undefined && typeof caps[flag] !== "boolean") return null;
            }
            const capabilities: types.voice.ModelCapabilities = { turnDetection: caps.turnDetection as types.voice.ModelCapabilities["turnDetection"], sampleRates: [...rates as number[]] };
            for (const flag of KNOWN_FLAGS) {
                if (typeof caps[flag] === "boolean") capabilities[flag] = caps[flag] as boolean;
            }
            const model: types.voice.VoiceModel = { id: raw.id, capabilities };
            if (typeof raw.label === "string") model.label = raw.label;
            if (typeof raw.description === "string") model.description = raw.description;
            return model;
        } catch { return null; }
    };
    const catalogue: types.voice.VoiceModel[] = [];
    for (const candidate of Array.isArray(definition!.models) ? definition!.models! : []) {
        const safe = safeModel(candidate);
        if (safe && !catalogue.some(known => known.id === safe.id)) catalogue.push(safe);
    }
    let model = catalogue.find(candidate => candidate.id === parsed.modelId) ?? null;
    if (!model && typeof definition!.listModels === "function") {
        const { conn } = await ctx.fns.voice.connections.resolve({ id: connection!.id });
        let discovered: unknown;
        try {
            discovered = await definition!.listModels!(ctx, conn);
        } catch {
            throw fail("catalogue-failed");
        }
        if (!Array.isArray(discovered)) throw fail("catalogue-failed");
        // Iteration and every field access stay inside the guards: a throwing getter on an entry is a malformed
        // item, never an escape with provider text. Duplicate ids keep the earlier catalogue entry.
        try {
            for (const candidate of discovered) {
                const safe = safeModel(candidate);
                if (safe && !catalogue.some(known => known.id === safe.id)) catalogue.push(safe);
            }
        } catch {
            throw fail("catalogue-failed");
        }
        model = catalogue.find(candidate => candidate.id === parsed.modelId) ?? null;
    }
    if (!model) throw fail("unknown-model");
    return {
        provider: parsed.provider,
        accountName: parsed.accountName,
        modelId: parsed.modelId,
        route: opts.route,
        connectionId: connection!.id,
        destination,
        model,
        // Safe: every validated capabilities list holds unique positive integers, so the first entry is a rate.
        sampleRate: model!.capabilities.sampleRates[0]!,
    };
}
