/**
 * Read subscription quota windows and account usage through the connection transport.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying scoped credentials and transport. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.UsageReport> {
    const { conn } = opts;
    const BASE = "https://chatgpt.com/backend-api";
    
            const a = await ctx.fns.models.provider.codex.codexWireAuth({ conn: conn });
            const res = await ctx.fns.models.provider.codex.codexWireChecked({ conn: conn, res: await conn.fetch(`${BASE}/wham/usage`, { headers: { authorization: `Bearer ${a.token}`, ...(a.accountId ? { "chatgpt-account-id": a.accountId } : {}), "user-agent": "codex-cli" } }) });
            const data = await res.json() as { rate_limit?: Record<string, unknown>; rate_limits?: Record<string, unknown>[] };
            const detail = data.rate_limit ?? data.rate_limits?.find?.(x => x?.limit_id === "codex") ?? data.rate_limits?.[0];
            const now = Date.now();
            const windows = [
                ctx.fns.models.provider.codex.codexWireWindowOf({ w: (detail?.primary_window ?? detail?.primary) as Record<string, unknown> | undefined, label: "Session", now: now }),
                ctx.fns.models.provider.codex.codexWireWindowOf({ w: (detail?.secondary_window ?? detail?.secondary) as Record<string, unknown> | undefined, label: "Weekly", now: now }),
            ].filter((w): w is NonNullable<typeof w> => !!w);
            if (!windows.length) throw new Error("Codex usage response has no quota windows");
            return { status: "available", reason: "usage-ok", checkedAt: now, windows };
}
