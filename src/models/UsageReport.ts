/** Standard usage snapshot, or status-only fallback from a cached connection test. */
export type UsageReport = {
    status: types.models.TestResult["status"];
    reason?: string;
    /** Subscription plan reported by the provider, when available. */
    plan?: string;
    /** Unix epoch milliseconds. */
    checkedAt: number;
    /**
     * Quota windows. Only windows with explicit `scope: "account"` and a known `period` are account-wide standard
     * limits shown in the main five-hour/weekly/monthly columns. Every other window (including label-only windows from
     * adapters that supply no metadata) is an additional limit; consumers never infer a period from `label`.
     */
    windows?: {
        /** Readable display name; never parsed for classification. */
        label: string;
        /** Stable provider-derived identity, unique within the report (e.g. `codex:primary`, `claude:seven_day_opus`). */
        id?: string;
        /** Standard period established from provider evidence; absent when unknown. */
        period?: "fiveHour" | "weekly" | "monthly";
        /** Whether the limit applies to the whole account, one model, or is unknown. Absent means unknown. */
        scope?: "account" | "model" | "unknown";
        /** Provider-reported window length in seconds, when reported. */
        durationSeconds?: number;
        /** Model name the limit applies to, when the provider names it. */
        model?: string;
        /** Unix epoch milliseconds when this window was observed; may predate `checkedAt` after partial updates. */
        observedAt?: number;
        /** Structured model family of a model-scoped measurement; consumers never derive it from `label`. */
        family?: "gemini" | "claude";
        /** Percentage from 0 to 100. */
        usedPercent?: number;
        remaining?: number;
        /** Unix epoch milliseconds, when known. */
        resetAt?: number;
    }[];
    balance?: { amount: number; currency: string };
    /** Families whose measurements are incomplete because safety caps dropped some of their windows. */
    partialFamilies?: ("gemini" | "claude")[];
};
