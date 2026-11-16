/** Provider registry and connection health cache owned by the models namespace. */
export type State = {
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
};
