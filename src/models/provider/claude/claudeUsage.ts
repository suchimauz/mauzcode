/**
 * Read subscription quota windows and account usage through the connection transport.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
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
    
            const h = await ctx.fns.models.provider.claude.claudeWireHeaders({ conn: conn, compact: false, usage: true });
            const res = await ctx.fns.models.provider.claude.claudeWireRequest({ conn: conn, path: "/api/oauth/usage", init: { headers: h } });
            const data = await res.json() as { five_hour?: { utilization?: number; resets_at?: string }; seven_day?: { utilization?: number; resets_at?: string } };
            const windows = [ctx.fns.models.provider.claude.claudeWireWindowOf({ raw: data.five_hour, label: "Session" }), ctx.fns.models.provider.claude.claudeWireWindowOf({ raw: data.seven_day, label: "Weekly" })].filter((w): w is NonNullable<typeof w> => !!w);
            if (!windows.length) throw new Error("Claude usage response has no quota windows");
            let plan: string | undefined;
            try {
                const profile = await ctx.fns.models.provider.claude.claudeWireRequest({ conn: conn, path: "/api/oauth/profile", init: { headers: h } });
                const p = await profile.json() as { organization?: { organization_type?: string } };
                const type = p.organization?.organization_type;
                plan = ({ claude_max: "Max", claude_pro: "Pro", claude_team: "Team", claude_enterprise: "Enterprise" } as Record<string, string>)[type ?? ""];
            } catch (error) {
                // Profile is optional; quota remains useful when this endpoint is unavailable.
                if (error instanceof Error && error.name === "AbortError") throw error;
            }
            return { status: "available", reason: "usage-ok", checkedAt: Date.now(), windows, ...(plan ? { plan } : {}) };
}
