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
        /** Unix epoch milliseconds. */
        checkedAt: number;
        /** Quota windows with their level; empty for status-only and balance-only connections. */
        windows: (NonNullable<types.models.UsageReport["windows"]>[number] & { level: types.frontendBridge.UsageLevel })[];
        balance?: { amount: number; currency: string };
        /** Worst window level; `normal` when no window reports a percentage. */
        level: types.frontendBridge.UsageLevel;
    }[];
};
