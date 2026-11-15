/**
 * Read Claude subscription quota windows from `/api/oauth/usage` plus the optional plan from the profile.
 *
 * Use from the Claude provider `usage` adapter. `five_hour` and `seven_day` are the account-wide fiveHour and weekly
 * windows (`claude:<key>` identities). Every other top-level quota-shaped record (finite `utilization`, not
 * disabled, no billing fields such as `monthly_limit`/`used_credits`) is kept as an additional window with its
 * source key as identity, the provider-supplied name or a readable key as label, and `model` scope only when the
 * record names its model; no model-name allowlist is used and nested objects are not traversed. Throws when no
 * valid window remains; the profile request is optional.
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
    const data = await res.json() as Record<string, unknown> | null;
    const now = Date.now();
    type Raw = { utilization?: unknown; resets_at?: unknown; is_enabled?: unknown; enabled?: unknown; name?: unknown; display_name?: unknown; model?: unknown; model_name?: unknown };
    const text = (v: unknown) => typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined;
    const windows: NonNullable<types.models.UsageReport["windows"]> = [];
    const general = { five_hour: { label: "Session", period: "fiveHour" }, seven_day: { label: "Weekly", period: "weekly" } } as const;
    for (const [key, spec] of Object.entries(general)) {
        const w = ctx.fns.models.provider.claude.claudeWireWindowOf({ raw: data?.[key] as Raw | undefined, label: spec.label, id: `claude:${key}`, period: spec.period, scope: "account", observedAt: now });
        if (w) windows.push(w);
    }
    const billing = ["monthly_limit", "used_credits", "credits", "currency", "amount", "balance"];
    for (const [key, value] of Object.entries(data ?? {}).slice(0, 50)) {
        if (Object.hasOwn(general, key) || !/^[a-z0-9_.-]{1,80}$/i.test(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;
        const raw = value as Raw & Record<string, unknown>;
        if (billing.some(k => Object.hasOwn(raw, k))) continue;
        const model = text(raw.model) ?? text(raw.model_name);
        const readable = key.replace(/^five_hour/, "5h").replace(/^seven_day/, "7d").replace(/[_-]+/g, " ").trim();
        const w = ctx.fns.models.provider.claude.claudeWireWindowOf({ raw, label: text(raw.display_name) ?? text(raw.name) ?? readable, id: `claude:${key}`, scope: model ? "model" : "unknown", ...(model ? { model } : {}), observedAt: now });
        if (w) windows.push(w);
    }
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
    return { status: "available", reason: "usage-ok", checkedAt: now, windows, ...(plan ? { plan } : {}) };
}
