/** SDK v0 backend contract for a mounted $modelProvider_<id>.ts declaration. */
export type ProviderDefinition = {
    /** Lowercase kebab-case id matching the declaration filename. */
    id: string;
    label: string;
    description?: string;
    /** Lucide icon name, brand:<id> from the shared model logo catalogue, or image data URL. */
    icon?: string;
    /** Optional provider identity and public pricing metadata; omission means no preamble or vendor. */
    inference?: {
        /** Identity instructions callers prepend to the system prompt. */
        systemPreamble?: string;
        /** Public price catalogue vendor identifier. */
        priceVendor?: string;
        /** Ordered public catalogue sections describing this provider's models' context and output limits; each list defaults to [priceVendor]. */
        catalog?: {
            /** models.dev vendor sections, tried in order with exact model ids. */
            modelsDev?: string[];
            /** @earendil-works/pi-ai built-in provider ids, tried in order with exact model ids. */
            piAi?: string[];
        };
    };
    fields: types.models.FieldSpec[];
    transports: types.models.TransportSpec["kind"][];
    /** Test this connection only; use conn.fetch and never log conn.secret results. */
    test: (ctx: Context, conn: types.models.ResolvedConnection) => Promise<types.models.TestResult>;
    listModels?: (ctx: Context, conn: types.models.ResolvedConnection) => Promise<types.models.ModelInfo[]>;
    usage?: (ctx: Context, conn: types.models.ResolvedConnection) => Promise<types.models.UsageReport>;
    /** Minimum interval between usage requests for one connection; available and unavailable reports are reused this long unless refresh is requested. Integer milliseconds. @default 60000 @minimum 10000 @maximum 3600000 */
    usageRefreshMs?: number;
    /** Additional provider-specific validation after core field validation. Throw to reject. */
    validate?: (ctx: Context, config: types.models.ResolvedConnection["config"]) => void | Promise<void>;
    /** Optional streaming inference; called only through models.stream after the enabled checks. Send traffic only through conn.fetch. */
    stream?: (ctx: Context, conn: types.models.ResolvedConnection, req: types.models.StreamRequest) => Promise<types.models.StreamResult>;
    /** Optional per-model shared-protocol routing, mutually exclusive with stream: models.stream runs every check, then streams through the returned shared protocol over conn.fetch. Receives the SDK-resolved reasoning when one was applicable; never perform inference here. */
    route?: (ctx: Context, conn: types.models.ResolvedConnection, req: { model: string; info: types.models.ModelInfo | null; sessionId: string; reasoning?: types.models.ReasoningResolution }) => Promise<types.models.ProtocolRoute>;
    /** Optional native transcript compaction; called only through models.compact after the enabled checks. */
    compact?: (ctx: Context, conn: types.models.ResolvedConnection, req: types.models.CompactRequest) => Promise<types.models.CompactResult>;
    /** Additive SDK features this provider opts into; omitted means none. */
    capabilities?: {
        /** Accepts and returns run-scoped ProviderState. */
        continuationState?: boolean;
        /** Accepts CheckpointEntry input and gets portable checkpoints wrapped around compact results. */
        checkpoints?: boolean;
        /** Receives SDK-normalized reasoning in StreamRequest.reasoning; requires model metadata or reasoningProfile. */
        reasoning?: boolean;
        /** Accepts StreamRequest.temperature and maxTokens; without it models.stream drops them. */
        sampling?: boolean;
        /** Accepts StreamRequest.responseFormat and maps it to native structured output; without it models.call uses an instruction fallback. */
        structuredOutput?: boolean;
    };
    /** Documented versioned reasoning profile used when model discovery metadata has none; return null when no profile applies to the model. */
    reasoningProfile?: (ctx: Context, model: string) => types.models.ReasoningCapabilities | null;
    actions?: Record<string, {
        label: string;
        /** Provider-owned login/logout/etc. Return only safe JSON, never credentials. */
        run: (ctx: Context, conn: types.models.ResolvedConnection, input: types.models.ActionValue) => Promise<types.models.ActionValue>;
    }>;
};
