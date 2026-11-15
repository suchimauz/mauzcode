/**
 * Normalize one Claude usage-endpoint quota record without inventing missing usage.
 *
 * Use from Claude usage adapters. Returns undefined for absent, null, explicitly disabled (`is_enabled`/`enabled`
 * false) records and records whose `utilization` is not a finite number; a missing or unparsable `resets_at` leaves
 * `resetAt` unset. Classification (`period`, `scope`) is supplied by the caller from the source key, never derived
 * from the label.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Raw quota record from `/api/oauth/usage`, or undefined when absent. */
        raw: { utilization?: unknown; resets_at?: unknown; is_enabled?: unknown; enabled?: unknown } | null | undefined;
        /** Readable display name. */
        label: string;
        /** Stable identity within the report, e.g. `claude:seven_day`. */
        id?: string;
        /** Standard period established from the documented source key; omit when unknown. */
        period?: "fiveHour" | "weekly";
        /** `account` for documented general windows, `model` for model-specific, `unknown` otherwise. */
        scope?: "account" | "model" | "unknown";
        /** Model family or name the limit applies to, when known. */
        model?: string;
        /** Observation time in Unix epoch milliseconds. */
        observedAt?: number;
    },
): NonNullable<types.models.UsageReport["windows"]>[number] | undefined {
    const { raw, label } = opts;
    if (!raw || typeof raw !== "object" || raw.is_enabled === false || raw.enabled === false) return undefined;
    if (typeof raw.utilization !== "number" || !Number.isFinite(raw.utilization)) return undefined;
    const resetAt = typeof raw.resets_at === "string" ? Date.parse(raw.resets_at) : NaN;
    return { label, ...(opts.id ? { id: opts.id } : {}), ...(opts.period ? { period: opts.period } : {}), ...(opts.scope ? { scope: opts.scope } : {}), ...(opts.model ? { model: opts.model } : {}),
        ...(opts.observedAt !== undefined ? { observedAt: opts.observedAt } : {}), usedPercent: Math.max(0, Math.min(100, raw.utilization)), ...(Number.isFinite(resetAt) && resetAt > 0 ? { resetAt } : {}) };
}
