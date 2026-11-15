/**
 * Normalize one Codex quota window, classifying its period only from reported duration.
 *
 * Use from Codex usage adapters. Accepts a positive finite `limit_window_seconds` and/or `window_minutes`; when both
 * are present they must agree. Exactly 18000 s is `fiveHour` and 604800 s is `weekly`; missing, invalid, conflicting
 * or other durations leave `period` unset. The slot (primary/secondary) and reset countdown never decide the period.
 * Returns null when `used_percent` is not a finite number, so null or missing usage never becomes 0%.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Raw Codex window object (`primary_window`, `secondary_window`, …), or undefined when absent. */
        w: Record<string, unknown> | undefined;
        /** Stable identity for this window within the report, e.g. `codex:primary`. */
        id: string;
        /** Display name used when no standard period is established, e.g. `Primary`. */
        label: string;
        /** `account` for the general Codex limit, `model`/`unknown` for additional limit entries. */
        scope: "account" | "model" | "unknown";
        /** Model name the limit applies to, when the provider names it. */
        model?: string;
        /** Observation time in Unix epoch milliseconds; also the base for `reset_after_seconds`. */
        now: number;
    },
): NonNullable<types.models.UsageReport["windows"]>[number] | null {
    const { w, now } = opts;
    if (!w || typeof w !== "object" || typeof w.used_percent !== "number" || !Number.isFinite(w.used_percent)) return null;
    const used = w.used_percent;
    const positive = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
    const direct = positive(w.resets_at ?? w.reset_at), after = typeof w.reset_after_seconds === "number" && Number.isFinite(w.reset_after_seconds) && w.reset_after_seconds >= 0 ? w.reset_after_seconds : undefined;
    const resetAt = direct !== undefined ? direct * 1000 : after !== undefined ? now + after * 1000 : undefined;
    const seconds = positive(w.limit_window_seconds), minutes = positive(w.window_minutes);
    const duration = seconds !== undefined && minutes !== undefined ? (seconds === minutes * 60 ? seconds : undefined) : seconds ?? (minutes !== undefined ? minutes * 60 : undefined);
    const period = duration === 18000 ? "fiveHour" as const : duration === 604800 ? "weekly" as const : undefined;
    const span = duration === undefined ? "" : duration % 86400 === 0 ? `${duration / 86400}d` : duration % 3600 === 0 ? `${duration / 3600}h` : `${Math.round(duration / 60)}m`;
    const label = opts.scope === "account" && period ? (period === "fiveHour" ? "Session (5h)" : "Weekly (7d)") : span ? `${opts.label} (${span})` : opts.label;
    return { id: opts.id, label, ...(period ? { period } : {}), scope: opts.scope, ...(duration !== undefined ? { durationSeconds: duration } : {}), ...(opts.model ? { model: opts.model } : {}),
        observedAt: now, usedPercent: Math.max(0, Math.min(100, used)), ...(resetAt !== undefined ? { resetAt } : {}) };
}
