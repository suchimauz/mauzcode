/** Aggregated usage of every enabled model connection, classified against the models.usage*Percent settings. */
export type ModelUsageView = {
    /** Unix epoch milliseconds of this aggregation. */
    updatedAt: number;
    /** Effective thresholds in percent; a value at or above a threshold reaches its level. */
    thresholds: { warn: number; critical: number; alert: number };
    connections: {
        /** Connection UUID. */
        id: string;
        /** Registered provider id. */
        provider: string;
        /** Provider-unique account name. */
        accountName: string;
        /** Provider label from its declaration, or the provider id when unregistered. */
        providerLabel: string;
        /** Usage status; `unavailable` when the usage request failed. */
        status: types.models.UsageReport["status"];
        reason?: string;
        plan?: string;
        /** Unix epoch milliseconds of the last successful observation when `stale`, else of this check. */
        checkedAt: number;
        /** The latest read failed; windows are the previous successful observation of this account, kept as stale. */
        stale?: boolean;
        /** Quota windows (with their classification metadata) and level; additional windows are included and count toward `level`. Empty for status-only and balance-only connections. */
        windows: (NonNullable<types.models.UsageReport["windows"]>[number] & { level: types.frontendBridge.UsageLevel })[];
        balance?: { amount: number; currency: string };
        /** Model families to show for this connection, in display order: those with at least one model of the cached catalogue not disabled by the owner. `partial` marks a family whose measurements were truncated. Absent when the catalogue names no family. */
        families?: { family: "gemini" | "claude"; partial: boolean }[];
        /** Worst window level; `normal` when no window reports a percentage. */
        level: types.frontendBridge.UsageLevel;
    }[];
};
