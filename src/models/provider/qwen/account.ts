/**
 * Read Qwen userinfo after login and adopt it as the connection's safe account summary
 *
 * Use only from models.provider.qwen.login after tokens were stored. Sends one GET to auth.qwen.ai /api/oauth/userinfo with the new bearer token through conn.fetch, saves name, email and plan (`member_type`) in the token store, and renames the connection to the reported email (else name) when it still has a default account name (`qwen`, `default`, `Qwen`, `Qwen Subscription`, case-insensitive). Characters not allowed in account names are replaced; a duplicate name keeps the old one. Any failure returns false and never fails the login. Never logs or returns the token.
 * @param opts.conn Resolved qwen connection; its fetch is the only network path.
 * @param opts.accessToken Freshly issued access token; used only for this request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection; its fetch is the only network path. */
        conn: types.models.ResolvedConnection;
        /** Freshly issued access token; used only for this request. */
        accessToken: string;
    },
): Promise<boolean> {
    const k = ctx.fns.models.provider.qwen.constants({});
    try {
        const res = await opts.conn.fetch(k.userinfoUrl, { method: "GET", headers: { authorization: "Bearer " + opts.accessToken, accept: "application/json", "user-agent": k.userAgent } });
        if (!res.ok) { await res.body?.cancel().catch(() => undefined); return false; }
        const info = await res.json().catch(() => null) as { name?: unknown; email?: unknown; member_type?: unknown } | null;
        if (!info || typeof info !== "object") return false;
        const str = (v: unknown) => typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;
        const account = { name: str(info.name), email: str(info.email), plan: str(info.member_type) };
        await ctx.fns.models.provider.qwen.auth({ conn: opts.conn, op: "account", account: Object.fromEntries(Object.entries(account).filter(([, v]) => v)) });
        const wanted = (account.email ?? account.name ?? "").replace(/[/:]/g, "-").slice(0, 100).trim();
        const current = (await ctx.fns.models.connections.get({ id: opts.conn.id })).accountName;
        if (wanted && /^(qwen|default|qwen subscription)$/i.test(current.trim()) && wanted !== current) {
            try { await ctx.fns.models.connections.update({ id: opts.conn.id, accountName: wanted }); } catch { /* duplicate or invalid: keep the old name */ }
        }
        return true;
    } catch { return false; }
}
