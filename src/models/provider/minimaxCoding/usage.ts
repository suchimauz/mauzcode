/**
 * Fetch MiniMax M Plan five-hour and weekly quota windows for one connection
 *
 * usage adapter of the minimax-coding provider; reached through models.usage / models.refreshAll. Sends one authenticated GET https://www.minimax.io/v1/token_plan/remains through the connection's transport (never directly; the method stays explicit because transport bridges default to POST and the endpoint answers GET only) and normalizes the `model_remains` entry named `general` (else the first) into the standard account-wide five-hour and weekly windows: remaining percent inverted to used percent, `end_time` / `weekly_end_time` kept as epoch-millisecond resetAt. The plan is always reported as "M Plan" because the response carries no tier name. An entry whose interval and weekly statuses are both 3 with zero totals is not in the plan. Throws a safe error carrying the HTTP status or the numeric MiniMax error code (never the response body) when the response is unrecognized or carries no valid window — missing quota is never reported as unused.
 * @param opts.conn Resolved minimax-coding connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved minimax-coding connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.UsageReport> {
    const headers = { accept: "application/json", ...(await ctx.fns.models.provider.minimaxCoding.headers({ conn: opts.conn, auth: "bearer" })) };
    const res = await opts.conn.fetch("https://www.minimax.io/v1/token_plan/remains", { method: "GET", headers, redirect: "error" });
    if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error("MiniMax quota request failed (HTTP " + res.status + ")");
    }
    const body = await res.json().catch(() => null) as {
        base_resp?: { status_code?: unknown };
        model_remains?: Array<Record<string, unknown>>;
    } | null;
    const code = Number(body?.base_resp?.status_code);
    if (!body || !Number.isFinite(code) || code !== 0) throw new Error("Unrecognized MiniMax quota response" + (Number.isFinite(code) && code !== 0 ? " (code " + code + ")" : ""));
    if (!Array.isArray(body.model_remains)) throw new Error("Unrecognized MiniMax quota response");
    // The M Plan groups text-model usage under "general"; video and other
    // modalities bill separately and must not color the coding rings.
    const entry = (body.model_remains.find(r => r?.model_name === "general") ?? body.model_remains[0]) as Record<string, unknown> | undefined;
    if (!entry || typeof entry !== "object") throw new Error("Unrecognized MiniMax quota response");
    // Both statuses 3 with zero totals is the documented "not in plan" shape:
    // an inactive key must stay unavailable, never look like unused quota.
    if (entry.current_interval_status === 3 && entry.current_weekly_status === 3
        && Number(entry.current_interval_total_count ?? 0) === 0 && Number(entry.current_weekly_total_count ?? 0) === 0)
        throw new Error("MiniMax quota response has no active plan entry");
    const window = (remaining: unknown, resetMs: unknown, slot: "five-hour" | "weekly"): NonNullable<types.models.UsageReport["windows"]>[number] | null => {
        const remainingPercent = Number(remaining), reset = Number(resetMs);
        if (!Number.isFinite(remainingPercent) || remainingPercent < 0 || remainingPercent > 100) return null;
        if (!Number.isFinite(reset) || reset <= 0) return null;
        return {
            id: `minimax-coding:${slot}`,
            label: slot === "five-hour" ? "Session (5h)" : "Weekly (7d)",
            period: slot === "five-hour" ? "fiveHour" : "weekly",
            scope: "account",
            durationSeconds: slot === "five-hour" ? 18000 : 604800,
            observedAt: Date.now(),
            usedPercent: Math.min(100, Math.max(0, 100 - remainingPercent)),
            resetAt: reset,
        };
    };
    const windows = [
        window(entry.current_interval_remaining_percent, entry.end_time, "five-hour"),
        window(entry.current_weekly_remaining_percent, entry.weekly_end_time, "weekly"),
    ].filter((w): w is NonNullable<types.models.UsageReport["windows"]>[number] => w !== null);
    if (!windows.length) throw new Error("MiniMax quota response has no recognized windows");
    return { status: "available", reason: "usage-ok", checkedAt: Date.now(), plan: "M Plan", windows };
}
