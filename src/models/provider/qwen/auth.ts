type QwenAuthRecord = { accessToken: string; refreshToken: string; expiresAt: number; needsLogin: boolean; account?: { name?: string; email?: string; plan?: string } };
/**
 * Read, store, refresh, invalidate or clear a Qwen connection's encrypted OAuth tokens
 *
 * Token store of the built-in qwen model provider. Keeps one encrypted local secret per connection (namespace models, `<id>.qwen-auth`) with compare-and-swap revisions and an absolute expiry. op `status` returns login state and the safe account summary (name, email, plan); `token` returns a valid access token, refreshing it with the refresh_token grant through conn.fetch (the connection transport) when it expires within 30 s, with one shared refresh per connection and stale-revision protection — the rotated refresh token is saved in the same CAS write; a rejected refresh (400/401, e.g. invalid_grant) marks login required. `store` saves tokens from a completed login; `account` merges the userinfo summary; `invalidate` marks the access token stale so the next `token` refreshes (after a gateway 401, never replaying the request); `markLogin` flags the connection as requiring login; `clear` deletes the tokens without network access and returns the captured refresh token only to the logout procedure for best-effort revocation. Throws code LOGIN_REQUIRED when no usable login exists. Callers must never return or log a credential.
 * @param opts.conn Resolved qwen connection; its fetch is the only network path.
 * @param opts.op Operation to perform.
 * @param opts.tokens OAuth token response to persist; required for op store.
 * @param opts.account Safe userinfo summary to merge; required for op account.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection; its fetch is the only network path. */
        conn: types.models.ResolvedConnection;
        /** Operation to perform. */
        op: "status" | "token" | "store" | "account" | "invalidate" | "markLogin" | "clear";
        /** OAuth token response to persist; required for op store. */
        tokens?: { access_token: string; refresh_token?: string; expires_in?: number };
        /** Safe userinfo summary to merge; required for op account. */
        account?: { name?: string; email?: string; plan?: string };
    },
): Promise<{ loggedIn: boolean; needsLogin: boolean; expiresAt: number | null; account: { name?: string; email?: string; plan?: string } | null; accessToken?: string; refreshToken?: string }> {
    const conn = opts.conn;
    const ns = "models", name = conn.id + ".qwen-auth";
    const k = ctx.fns.models.provider.qwen.constants({});
    const fail = (message: string, code: string) => Object.assign(new Error(message), { code, status: 409, retryable: false });
    const read = async (): Promise<{ version: number; value: QwenAuthRecord } | null> => {
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT value_enc, version FROM local_secrets WHERE namespace=? AND name=?", params: [ns, name] }) as { value_enc: string; version: number }[];
        if (!rows[0]) return null;
        const value = JSON.parse(await ctx.fns.secrets.decryptLocal({ namespace: ns, name, envelope: rows[0].value_enc })) as QwenAuthRecord;
        return { version: Number(rows[0].version), value };
    };
    const cas = async (version: number, value: QwenAuthRecord): Promise<boolean> => {
        const envelope = await ctx.fns.secrets.encryptLocal({ namespace: ns, name, value: JSON.stringify(value) });
        const rows = await ctx.fns.procs.db.select({ sql: "UPDATE local_secrets SET value_enc=?, version=version+1, source='qwen-refresh', updated_at=? WHERE namespace=? AND name=? AND version=? RETURNING version", params: [envelope, Date.now(), ns, name, version] });
        return rows.length > 0;
    };
    const touch = async () => {
        await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET updated_at = GREATEST(updated_at + 1, ?) WHERE id=?", params: [Date.now(), conn.id] });
        try { await ctx.fns.procs.events.refresh({ topic: "llm-models", reason: "models-qwen-auth" }); } catch (error) { ctx.fns.procs.log.debug({ event: "models.refresh", msg: String(error) }); }
    };
    const record = (t: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown }, previous?: QwenAuthRecord): QwenAuthRecord => {
        if (typeof t.access_token !== "string" || !t.access_token) throw new Error("Token response has no access token");
        const seconds = Number(t.expires_in);
        return {
            accessToken: t.access_token,
            refreshToken: typeof t.refresh_token === "string" && t.refresh_token ? t.refresh_token : previous?.refreshToken ?? "",
            expiresAt: Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 3600_000),
            needsLogin: false,
            ...(previous?.account ? { account: previous.account } : {}),
        };
    };
    const summary = (r: QwenAuthRecord | null | undefined) => ({
        loggedIn: !!r && !r.needsLogin, needsLogin: !r || r.needsLogin, expiresAt: r?.expiresAt ?? null,
        account: r?.account && Object.keys(r.account).length ? { ...r.account } : null,
    });
    const update = async (change: (r: QwenAuthRecord) => QwenAuthRecord | null) => {
        for (let i = 0; i < 3; i++) {
            const cur = await read();
            if (!cur) break;
            const next = change(cur.value);
            if (!next) break;
            if (await cas(cur.version, next)) { await touch(); break; }
        }
        return summary((await read())?.value);
    };

    if (opts.op === "status") return summary((await read())?.value);
    if (opts.op === "clear") {
        const cur = await read();
        await ctx.fns.secrets.deleteLocal({ namespace: ns, name });
        await touch();
        return { ...summary(null), ...(cur?.value.refreshToken ? { refreshToken: cur.value.refreshToken } : {}) };
    }
    if (opts.op === "store") {
        if (!opts.tokens) throw new Error("tokens required");
        const value = record(opts.tokens);
        await ctx.fns.secrets.putLocal({ namespace: ns, name, value: JSON.stringify(value), source: "qwen-login" });
        await touch();
        return summary(value);
    }
    if (opts.op === "account") {
        const a = opts.account ?? {};
        const clean = Object.fromEntries((["name", "email", "plan"] as const).flatMap(key => typeof a[key] === "string" && a[key]!.trim() ? [[key, a[key]!.trim().slice(0, 200)]] : []));
        return update(r => ({ ...r, account: clean }));
    }
    if (opts.op === "invalidate") return update(r => r.needsLogin || r.expiresAt === 0 ? null : { ...r, expiresAt: 0 });
    if (opts.op === "markLogin") return update(r => r.needsLogin ? null : { ...r, needsLogin: true });
    // op === "token"
    const fresh = (r: QwenAuthRecord) => r.expiresAt - Date.now() > k.refreshMarginMs;
    const first = await read();
    if (!first || first.value.needsLogin || !first.value.accessToken) throw fail("Qwen login required", "LOGIN_REQUIRED");
    if (fresh(first.value)) return { ...summary(first.value), accessToken: first.value.accessToken };
    ctx.state.models ??= {};
    const inflight = (ctx.state.models.qwenRefresh ??= {});
    inflight[conn.id] ??= (async () => {
        const cur = await read();
        if (!cur || cur.value.needsLogin) throw fail("Qwen login required", "LOGIN_REQUIRED");
        if (fresh(cur.value)) return cur.value.accessToken;
        if (!cur.value.refreshToken) { await ctx.fns.models.provider.qwen.auth({ conn, op: "markLogin" }); throw fail("Qwen login required", "LOGIN_REQUIRED"); }
        const res = await conn.fetch(k.tokenUrl, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": k.userAgent },
            body: new URLSearchParams({ grant_type: "refresh_token", client_id: k.clientId, refresh_token: cur.value.refreshToken }).toString(),
        });
        if (res.status === 400 || res.status === 401) {
            await res.body?.cancel().catch(() => undefined);
            await ctx.fns.models.provider.qwen.auth({ conn, op: "markLogin" });
            throw fail("Qwen login required: token refresh was rejected", "LOGIN_REQUIRED");
        }
        if (!res.ok) { await res.body?.cancel().catch(() => undefined); throw Object.assign(new Error("Qwen token refresh failed with HTTP " + res.status), { code: "REFRESH_FAILED", status: 502 }); }
        const next = record(await res.json() as Record<string, unknown>, cur.value);
        if (await cas(cur.version, next)) return next.accessToken;
        const raced = await read();
        if (raced && !raced.value.needsLogin && fresh(raced.value)) return raced.value.accessToken;
        throw Object.assign(new Error("Qwen credentials changed during refresh"), { code: "REFRESH_FAILED", status: 409 });
    })().finally(() => { delete inflight[conn.id]; });
    const accessToken = await inflight[conn.id]!;
    return { ...summary((await read())?.value), accessToken };
}
