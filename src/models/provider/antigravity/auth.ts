type AntigravityAuthRecord = { accessToken: string; refreshToken: string; expiresAt: number; needsLogin: boolean; projectId?: string; after401?: boolean };
/**
 * Read, store, refresh, invalidate or clear an Antigravity connection's encrypted Google grant and project
 *
 * Token store of the antigravity provider. Keeps one encrypted local secret per connection (namespace models,
 * `<id>.antigravity-auth`) with compare-and-swap revisions: tokens, absolute expiry, a login-required flag and the
 * account's Cloud Code project. op `status` returns safe login state; `token` returns a valid access token,
 * refreshing it with the refresh_token grant through the connection transport when it expires within the refresh
 * margin, one shared refresh per connection; a refresh rejected with 400/401 (revoked grant) marks login required,
 * forgets the project and the cached model list and fails LOGIN_REQUIRED. `store` saves a completed login and
 * forgets the previous project and model list; `project` caches the resolved project; `rejected` handles a 401 for
 * the given access token: the first one marks the token stale so the next attempt refreshes and reports `retry`,
 * a 401 for a token that was itself refreshed after a 401 reports no retry; `accepted` clears that mark; `clear`
 * deletes the grant, project and model list without network access. A write that loses its revision (logout
 * during refresh) never restores credentials. Results never contain account tokens except `accessToken` from
 * `token`, which callers must not return or log.
 * @param opts.conn Resolved antigravity connection; its fetch is the only network path.
 * @param opts.op Operation to perform.
 * @param opts.tokens OAuth token response to persist; required for op store.
 * @param opts.projectId Resolved Cloud Code project id; required for op project.
 * @param opts.accessToken Access token the rejected or accepted request used; required for ops rejected and accepted.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection; its fetch is the only network path. */
        conn: types.models.ResolvedConnection;
        /** Operation to perform. */
        op: "status" | "token" | "store" | "project" | "rejected" | "accepted" | "clear";
        /** OAuth token response to persist; required for op store. */
        tokens?: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
        /** Resolved Cloud Code project id; required for op project. */
        projectId?: string;
        /** Access token the rejected or accepted request used; required for ops rejected and accepted. */
        accessToken?: string;
    },
): Promise<{ loggedIn: boolean; needsLogin: boolean; expiresAt: number | null; projectId: string | null; accessToken?: string; retry?: boolean }> {
    const { conn } = opts;
    const ns = "models", name = conn.id + ".antigravity-auth";
    const k = ctx.fns.models.provider.antigravity.constants({});
    const loginRequired = () => ctx.fns.models.inference.failure({ message: "Antigravity login required", status: 409, info: { code: "LOGIN_REQUIRED", classification: "auth", acceptance: "none", retryable: false, replaySafe: true } });
    const read = async (): Promise<{ version: number; value: AntigravityAuthRecord } | null> => {
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT value_enc, version FROM local_secrets WHERE namespace=? AND name=?", params: [ns, name] }) as { value_enc: string; version: number }[];
        if (!rows[0]) return null;
        return { version: Number(rows[0].version), value: JSON.parse(await ctx.fns.secrets.decryptLocal({ namespace: ns, name, envelope: rows[0].value_enc })) as AntigravityAuthRecord };
    };
    const cas = async (version: number, value: AntigravityAuthRecord): Promise<boolean> => {
        const envelope = await ctx.fns.secrets.encryptLocal({ namespace: ns, name, value: JSON.stringify(value) });
        return (await ctx.fns.procs.db.select({ sql: "UPDATE local_secrets SET value_enc=?, version=version+1, source='antigravity-refresh', updated_at=? WHERE namespace=? AND name=? AND version=? RETURNING version", params: [envelope, Date.now(), ns, name, version] })).length > 0;
    };
    const touch = async (forgetModels: boolean) => {
        await ctx.fns.procs.db.run({ sql: `UPDATE llm_connections SET updated_at = GREATEST(updated_at + 1, ?)${forgetModels ? ", models_cache = NULL, models_cached_at = NULL, models_refresh_ticket = models_refresh_ticket + 1" : ""} WHERE id=?`, params: [Date.now(), conn.id] });
        try { await ctx.fns.procs.events.refresh({ topic: "llm-models", reason: "models-antigravity-auth" }); } catch { /* Notification failure cannot invalidate saved credentials. */ }
    };
    const summary = (r: AntigravityAuthRecord | null | undefined) => ({ loggedIn: !!r && !r.needsLogin, needsLogin: !r || r.needsLogin, expiresAt: r?.expiresAt ?? null, projectId: r && !r.needsLogin ? r.projectId ?? null : null });
    const update = async (change: (r: AntigravityAuthRecord) => AntigravityAuthRecord | null, forgetModels = false) => {
        for (let i = 0; i < 3; i++) {
            const cur = await read();
            if (!cur) return null;
            const next = change(cur.value);
            if (!next) return cur.value;
            if (await cas(cur.version, next)) { await touch(forgetModels); return next; }
        }
        return (await read())?.value ?? null;
    };

    if (opts.op === "status") return summary((await read())?.value);
    if (opts.op === "clear") {
        await ctx.fns.secrets.deleteLocal({ namespace: ns, name });
        await touch(true);
        return summary(null);
    }
    if (opts.op === "store") {
        const t = opts.tokens ?? {};
        const seconds = Number(t.expires_in);
        if (typeof t.access_token !== "string" || !t.access_token || typeof t.refresh_token !== "string" || !t.refresh_token || !Number.isFinite(seconds) || seconds <= 0) throw new Error("Incomplete Antigravity token response");
        const value: AntigravityAuthRecord = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + seconds * 1000, needsLogin: false };
        await ctx.fns.secrets.putLocal({ namespace: ns, name, value: JSON.stringify(value), source: "antigravity-login" });
        await touch(true);
        return summary(value);
    }
    if (opts.op === "project") {
        const id = typeof opts.projectId === "string" ? opts.projectId.trim().slice(0, 200) : "";
        if (!id) throw new Error("Project id required");
        return summary(await update(r => r.needsLogin || r.projectId === id ? null : { ...r, projectId: id }));
    }
    if (opts.op === "rejected" || opts.op === "accepted") {
        let retry = false;
        const r = await update(cur => {
            if (cur.needsLogin || cur.accessToken !== opts.accessToken) return null;
            if (opts.op === "accepted") return cur.after401 ? { ...cur, after401: false } : null;
            // A token refreshed because of a 401 that is itself rejected is final: no third request.
            if (cur.after401) return { ...cur, after401: false };
            retry = true;
            return { ...cur, expiresAt: 0, after401: true };
        });
        return { ...summary(r), retry };
    }
    // op === "token"
    const fresh = (r: AntigravityAuthRecord) => r.expiresAt - Date.now() > k.refreshMarginMs;
    const first = await read();
    if (!first || first.value.needsLogin) throw loginRequired();
    if (fresh(first.value)) return { ...summary(first.value), accessToken: first.value.accessToken };
    ctx.state.models ??= {};
    const state = ctx.state.models as typeof ctx.state.models & { antigravityRefresh?: Record<string, Promise<string>> };
    const inflight = (state.antigravityRefresh ??= {});
    inflight[conn.id] ??= (async () => {
        const cur = await read();
        if (!cur || cur.value.needsLogin) throw loginRequired();
        if (fresh(cur.value)) return cur.value.accessToken;
        let res: Response;
        try {
            res = await ctx.fns.models.provider.antigravity.request({ conn, url: k.tokenUrl, init: {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
                body: new URLSearchParams({ grant_type: "refresh_token", client_id: k.clientId, client_secret: k.clientSecret, refresh_token: cur.value.refreshToken }).toString(),
            } });
        } catch {
            throw ctx.fns.models.inference.failure({ message: "Antigravity token refresh failed", info: { code: "REFRESH_FAILED", classification: "transport", acceptance: "none", retryable: true, replaySafe: true } });
        }
        if (res.status === 400 || res.status === 401) {
            await res.body?.cancel().catch(() => undefined);
            // Revoked or expired grant: sign-in is required and the account's project and models are forgotten.
            if (await cas(cur.version, { ...cur.value, needsLogin: true, projectId: undefined, after401: false })) await touch(true);
            throw loginRequired();
        }
        if (!res.ok) {
            await res.body?.cancel().catch(() => undefined);
            throw ctx.fns.models.inference.failure({ message: "Antigravity token refresh failed", info: { code: "REFRESH_FAILED", classification: "provider", upstreamStatus: res.status, acceptance: "none", retryable: res.status >= 500, replaySafe: true } });
        }
        const body = await res.json().catch(() => null) as Record<string, unknown> | null;
        const seconds = Number(body?.expires_in);
        if (!body || typeof body.access_token !== "string" || !body.access_token) throw ctx.fns.models.inference.failure({ message: "Antigravity token refresh returned an incomplete response", info: { code: "REFRESH_FAILED", classification: "provider", acceptance: "none", retryable: false, replaySafe: true } });
        const next: AntigravityAuthRecord = {
            ...cur.value, accessToken: body.access_token,
            refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : cur.value.refreshToken,
            expiresAt: Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000,
        };
        // A lost revision means logout or a new login happened meanwhile; never restore the old grant.
        if (await cas(cur.version, next)) return next.accessToken;
        const raced = await read();
        if (raced && !raced.value.needsLogin && fresh(raced.value)) return raced.value.accessToken;
        throw loginRequired();
    })().finally(() => { delete inflight[conn.id]; });
    const accessToken = await inflight[conn.id]!;
    return { ...summary((await read())?.value), accessToken };
}
