/** Provider registry and connection health cache owned by the models namespace. */
export type State = {
    /** Unforgeable per-invocation context. Never derive chat consent or a retry pin from SDK input. */
    codexDispatch?: WeakMap<object, { chat?: (route: { connectionId: string; generation: string | null; modelId: string }) => Promise<{ speed?: "fast" | "ultrafast"; verbosity?: "low" | "medium" | "high" }>; pin?: { generation?: string | null }; generation?: string | null }>;

    /** Transport-only final admission, keyed by the exact request init created by the provider. */
    codexHandoff?: WeakMap<RequestInit, (send: (body: string) => void) => Promise<void>>;
    providers?: Record<string, {
        owner: string;
        module: string;
        rel: string;
        definition: types.models.ProviderDefinition;
    }>;
    /** `<connection id>:<Bun.hash(id + updated_at)>:<test|usage>` key; 60 s expiry with in-flight de-duplication. */
    health?: Record<string, {
        expiresAt: number;
        result?: types.models.UsageReport | types.models.TestResult;
        pending?: Promise<types.models.UsageReport | types.models.TestResult>;
    }>;
    /** In-flight Codex token refresh per connection id; de-duplicates concurrent refreshes. */
    codexRefresh?: Record<string, Promise<string>>;
    /** Immutable refresh results, keyed by connection, issuing generation and revision. */
    codexBoundRefresh?: Record<string, Promise<{ generation: string | null; credentialRevision: number; loggedIn: boolean; needsLogin: boolean; accountId: string | null; expiresAt: number | null; accessToken?: string }>>;
    /** Process-local provider login flows (Codex, Claude, Qwen) by connection id; lost on restart. */
    loginFlows?: Record<string, types.models.LoginFlow>;
    /** In-flight Qwen token refresh per connection id; de-duplicates concurrent refreshes. */
    qwenRefresh?: Record<string, Promise<string>>;
    /** Per-connection Qwen lock serializing login-flow invalidation and token persistence. */
    qwenLocks?: Record<string, Promise<void>>;
    /** Process-local Qwen weekly-credit exhaustion observed from a 402 insufficient_quota, by connection id; times are epoch ms; `until` is the reset time or, when Qwen sent none, a one-hour display limit. */
    qwenQuota?: Record<string, { resetAt?: number; observedAt: number; until: number }>;
    /** In-memory cache of the installation-wide session affinity salt (hex), loaded once from the local encrypted secret store. */
    sessionAffinitySalt?: Promise<string | null>;
    /** True once a failure to read or create the session affinity salt has been logged. */
    sessionAffinityWarned?: boolean;
    /** Tail of the serialized setProviderEnabled read-modify-write queue (models.api); rejection-recovered so a failed write cannot block later toggles. */
    disabledProvidersQueue?: Promise<unknown>;
};
