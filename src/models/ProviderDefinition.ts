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
    /** Explicit, account-bound link retrieval for the tool step issued by this provider. Never an inference tool. */
    nativeWebSearch?: types.models.NativeWebSearchOperation;
    fields: types.models.FieldSpec[];
    transports: types.models.TransportSpec["kind"][];
    /** Test this connection only; use conn.fetch and never log conn.secret results. */
    test: (ctx: Context, conn: types.models.ResolvedConnection) => Promise<types.models.TestResult>;
    listModels?: (ctx: Context, conn: types.models.ResolvedConnection) => Promise<types.models.ModelInfo[]>;
    usage?: (ctx: Context, conn: types.models.ResolvedConnection) => Promise<types.models.UsageReport>;
    /** Secret-free effective request identity; refresh discards local CLI detection cache. */
    clientVersion?: (ctx: Context, conn: types.models.ResolvedConnection, opts: { refresh?: boolean }) => Promise<{ version: string; source: string; detail?: string }>;
    /** Minimum interval between usage requests for one connection; available and unavailable reports are reused this long unless refresh is requested. Integer milliseconds. @default 60000 @minimum 10000 @maximum 3600000 */
    usageRefreshMs?: number;
    /** Usage contract version; cached and retained snapshots of another version are discarded instead of reused. Safe identifier, at most 40 characters. */
    usageSnapshotVersion?: string;
    /** After a failed usage read, keep the previous successful snapshot of the same connection revision, marked `stale` with its original `checkedAt`, instead of reporting unavailable. @default false */
    usageStaleOnFailure?: boolean;
    /** Additional provider-specific validation after core field validation. Throw to reject. */
    validate?: (ctx: Context, config: types.models.ResolvedConnection["config"]) => void | Promise<void>;
    /** Optional streaming inference; called only through models.stream after the enabled checks. Send traffic only through conn.fetch. */
    stream?: (ctx: Context, conn: types.models.ResolvedConnection, req: types.models.StreamRequest) => Promise<types.models.StreamResult>;
    /** Optional per-model shared-protocol routing, mutually exclusive with stream: models.stream runs every check, then streams through the returned shared protocol over conn.fetch. Receives the SDK-resolved reasoning when one was applicable; never perform inference here. */
    route?: (ctx: Context, conn: types.models.ResolvedConnection, req: { model: string; info: types.models.ModelInfo | null; sessionId: string; reasoning?: types.models.ReasoningResolution }) => Promise<types.models.ProtocolRoute>;
    /** Optional native transcript compaction; called only through models.compact after the enabled checks. */
    compact?: (ctx: Context, conn: types.models.ResolvedConnection, req: types.models.CompactRequest) => Promise<types.models.CompactResult>;
    /** Optional classifier for a failed protocol-route request: receives the upstream status and the bounded, JSON-parsed error body (null when unparseable) and returns a stable code, classification, retryability, optional reset time and a fixed credential-safe message — never body text. Return null (or throw) to fall back to the status-based classification. */
    classifyFailure?: (ctx: Context, conn: types.models.ResolvedConnection, input: { status: number; body: unknown | null; model: string }) => Promise<{ code: string; classification: types.models.FailureInfo["classification"]; retryable: boolean; retryAfterMs?: number; resetAt?: number; message: string } | null> | { code: string; classification: types.models.FailureInfo["classification"]; retryable: boolean; retryAfterMs?: number; resetAt?: number; message: string } | null;
    /** Optional exact input token counting through the connection's transport, with the same request shape as streaming (no generation happens); called through models.countTokens after the enabled checks. Return the provider-reported non-negative count. */
    countTokens?: (ctx: Context, conn: types.models.ResolvedConnection, req: { model: string; messages: (Record<string, unknown> | types.models.CheckpointEntry)[]; instructions?: string; tools?: types.models.ToolSpec[] }) => Promise<number>;
    /** Additive SDK features this provider opts into; omitted means none. */
    capabilities?: {
        /** Accepts and returns run-scoped ProviderState. */
        continuationState?: boolean;
        /** Accepts CheckpointEntry input and gets portable checkpoints wrapped around compact results. */
        checkpoints?: boolean;
        /** Receives SDK-normalized reasoning in StreamRequest.reasoning; requires model metadata or reasoningProfile. */
        reasoning?: boolean;
        /** Routes resolve only against the cached catalogue and reasoning levels exist only as ModelInfo.reasoning.variants: models.stream and route resolution fail MODEL_UNAVAILABLE for a model absent from the cache (including a cold cache, without discovery), and cached reasoning metadata without variants offers no levels. */
        variantCatalogue?: boolean;
        /** Owner availability applies to each `reasoning.variants` group as a whole (models.catalog.effectiveDisabled): a group is off by its own id or when every member id is stored disabled (unconverted legacy flags); otherwise all its provider-eligible levels stay offered. Member ids of a known group cannot be toggled individually (models.setModelEnabled fails VALIDATION), and legacy member disables are converted to group-only flags after each successful catalogue refresh and at startup. Without it, a disabled member removes only its own level. */
        groupAvailability?: boolean;
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
