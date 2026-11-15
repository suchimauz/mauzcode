/**
 * Normalize one Z.ai Coding Plan quota record into a standard usage window
 *
 * Use from the zai-coding usage adapter for each `CREDIT_LIMIT` entry of `api.z.ai/api/monitor/usage/quota/limit`. Classification comes only from the documented `unit`/`number` pair — `unit 3, number 5` is the account-wide five-hour window, `unit 6, number 1` the weekly one — never from ordering or labels. Returns null for an unrecognized pair or a record whose `percentage` is not a finite number in 0..100, so a missing or malformed value never becomes zero usage; a missing or non-positive `nextResetTime` leaves `resetAt` unset.
 * @param opts.raw One `data.limits[]` entry from the quota endpoint.
 * @param opts.observedAt Observation time in Unix epoch milliseconds.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** One `data.limits[]` entry from the quota endpoint. */
        raw: unknown;
        /** Observation time in Unix epoch milliseconds. */
        observedAt: number;
    },
): NonNullable<types.models.UsageReport["windows"]>[number] | null {
    const _ctx = ctx;
    const raw = opts.raw as { type?: unknown; unit?: unknown; number?: unknown; percentage?: unknown; nextResetTime?: unknown } | null | undefined;
    if (!raw || typeof raw !== "object" || raw.type !== "CREDIT_LIMIT") return null;
    const slot = raw.unit === 3 && raw.number === 5 ? "five-hour" : raw.unit === 6 && raw.number === 1 ? "weekly" : null;
    if (!slot) return null;
    const used = raw.percentage;
    if (typeof used !== "number" || !Number.isFinite(used) || used < 0 || used > 100) return null;
    // The endpoint reports an epoch-millisecond deadline; the contract keeps epoch milliseconds.
    const reset = typeof raw.nextResetTime === "number" && Number.isFinite(raw.nextResetTime) && raw.nextResetTime > 0 ? raw.nextResetTime : undefined;
    return {
        id: `zai-coding:${slot}`,
        label: slot === "five-hour" ? "Session (5h)" : "Weekly (7d)",
        period: slot === "five-hour" ? "fiveHour" : "weekly",
        scope: "account",
        durationSeconds: slot === "five-hour" ? 18000 : 604800,
        observedAt: opts.observedAt,
        usedPercent: used,
        ...(reset !== undefined ? { resetAt: reset } : {}),
    };
}
