/**
 * Read and validate the three OpenCode Go subscription quota windows.
 *
 * Shared by opencodeGo.usage and opencodeGo.test. Sends an authenticated GET https://opencode.ai/inference/go/v1/usage through the connection's transport and validates rolling, weekly and monthly windows ({status ok|rate-limited, percent 0..100 used, resetsAt ISO}). Returns ok:false with the HTTP status (0 for a transport failure or invalid payload) instead of zero usage; never includes response bodies or the key.
 * @param opts.conn Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved opencode-go connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<{ ok: true; windows: { label: string; usedPercent: number; resetAt: number }[] } | { ok: false; status: number }> {
    let res: Response;
        try {
            const headers = { accept: "application/json", ...(await ctx.fns.opencodeGo.headers({ conn: opts.conn })) };
            res = await opts.conn.fetch("https://opencode.ai/inference/go/v1/usage", { headers, redirect: "error", signal: AbortSignal.timeout(30000) });
        } catch { return { ok: false, status: 0 }; }
        if (!res.ok) { await res.body?.cancel().catch(() => undefined); return { ok: false, status: res.status }; }
        const body = await res.json().catch(() => null) as { usage?: Record<string, { percent?: unknown; status?: unknown; resetsAt?: unknown }> } | null;
        const windows: { label: string; usedPercent: number; resetAt: number }[] = [];
        for (const [key, label] of [["rolling", "5h"], ["weekly", "Weekly"], ["monthly", "Monthly"]] as const) {
            const w = body?.usage?.[key];
            const reset = typeof w?.resetsAt === "string" ? Date.parse(w.resetsAt) : NaN;
            if (!w || typeof w.percent !== "number" || !Number.isFinite(w.percent) || w.percent < 0 || w.percent > 100 || (w.status !== "ok" && w.status !== "rate-limited") || !Number.isFinite(reset) || reset <= 0) return { ok: false, status: 0 };
            windows.push({ label, usedPercent: w.status === "rate-limited" ? 100 : w.percent, resetAt: reset });
        }
        return { ok: true, windows };
}
