type RecordValue = { idToken: string; accessToken: string; refreshToken: string; accountId: string; expiresAt: number; needsLogin: boolean };
type Fence = { generation: string | null; credentialRevision: number };
type Snapshot = Fence & { value: RecordValue | null; intent: string | null; refreshOwner: string | null };
type Result = Fence & { loggedIn: boolean; needsLogin: boolean; accountId: string | null; expiresAt: number | null; accessToken?: string };

/**
 * Resolve or mutate the encrypted credential and its connection-owned account binding.
 * A single SQL snapshot pairs token and identity. Network renewal runs outside the lock;
 * every mutation rechecks the issuing fence under the same lock as catalogue publication.
 */
export default async function (
    ctx: Context, session: Session | null, opts: {
        /** Connection providing scoped OAuth transport. */
        conn: types.models.ResolvedConnection | types.models.NativeWebSearchConnection;
        /** Status never refreshes or returns a token. Native reads require a one-use locked SDK proof. */
        op: "nativeRead" | "status" | "token" | "store" | "markLogin" | "clear";
        /** SDK-issued one-use proof for a locked search credential read. */
        proof?: types.models.NativeWebSearchProof;
        /** Fresh OAuth response from the issuer. */
        tokens?: { id_token?: string; access_token: string; refresh_token?: string };
        /** Login intent reserved before requesting a device code. */
        intent?: string;
        /** Credential fence captured at dispatch; required for markLogin. */
        auth?: Fence;
    },
): Promise<Result> {
    const { conn } = opts;
    const namespace = "models", name = `${conn.id}.codex-auth`;
    const fail = (message: string, code: string) => Object.assign(new Error(message), { code, status: 409, retryable: false });
    const changed = () => fail("Codex credentials changed; start a new request", "CREDENTIAL_CHANGED");
    const read = async (lock: boolean): Promise<Snapshot> => {
        // Lock in a separate statement: at READ COMMITTED a waiter then reads the winning
        // writer's secret and row from one new snapshot, not a stale joined secret.
        if (lock) await ctx.fns.procs.db.select({ sql: "SELECT id FROM llm_connections WHERE id=? FOR UPDATE", params: [conn.id] });
        const [r] = await ctx.fns.procs.db.select({ sql: `SELECT c.codex_generation,c.codex_credential_revision,c.codex_login_intent,c.codex_refresh_owner,s.value_enc
            FROM llm_connections c LEFT JOIN local_secrets s ON s.namespace=? AND s.name=? WHERE c.id=?`, params: [namespace, name, conn.id] });
        if (!r) throw changed();
        const value: RecordValue | null = r.value_enc ? JSON.parse(await ctx.fns.secrets.decryptLocal({ namespace, name, envelope: r.value_enc })) : null;
        return { value, generation: r.codex_generation, credentialRevision: Number(r.codex_credential_revision), intent: r.codex_login_intent, refreshOwner: r.codex_refresh_owner };
    };
    const result = (s: Snapshot, includeToken = false): Result => Object.freeze({ generation: s.generation, credentialRevision: s.credentialRevision,
        loggedIn: !!s.value && !s.value.needsLogin, needsLogin: !s.value || s.value.needsLogin,
        accountId: s.generation ? s.value?.accountId || null : null, expiresAt: s.value?.expiresAt ?? null,
        ...(includeToken && s.value ? { accessToken: s.value.accessToken } : {}) });
    const claims = (token: unknown) => {
        try { return JSON.parse(Buffer.from(String(token).split(".")[1]!, "base64url").toString()); } catch { return null; }
    };
    const record = (t: NonNullable<typeof opts.tokens>, previous?: RecordValue | null): RecordValue => {
        if (typeof t.access_token !== "string" || !t.access_token) throw new Error("Token response has no access token");
        const access = claims(t.access_token), id = claims(t.id_token);
        const ids = [access,id].map(c => c?.["https://api.openai.com/auth"]?.chatgpt_account_id).filter(v => v !== undefined);
        const verified = ids.length && ids.every(v => typeof v === "string" && /^[!-~]{1,256}$/.test(v) && v === ids[0]);
        return { accessToken: t.access_token, idToken: typeof t.id_token === "string" ? t.id_token : "",
            refreshToken: typeof t.refresh_token === "string" && t.refresh_token ? t.refresh_token : previous?.refreshToken ?? "",
            accountId: verified ? ids[0] : "", expiresAt: Number.isFinite(access?.exp) && access.exp > 0 ? access.exp * 1000 : Date.now() + 3600_000, needsLogin: false };
    };
    const mutate = async (op: "clear" | "markLogin" | "store" | "renew", tokens?: typeof opts.tokens, issuing?: Fence, owner?: string): Promise<Result> => {
        let committed = false;
        const out = await ctx.fns.procs.db.transaction({ fn: async () => {
            const cur = await read(true);
            if (op === "store" && (!opts.intent || cur.intent !== opts.intent || opts.intent.startsWith("done:"))) throw changed();
            if ((op === "markLogin" || op === "renew") && (!issuing || (owner && cur.refreshOwner !== owner) || issuing.credentialRevision !== cur.credentialRevision || issuing.generation !== cur.generation)) {
                if (op === "markLogin") return result(cur);
                throw changed();
            }
            if (op === "markLogin" && (!cur.value || cur.value.needsLogin)) return result(cur);
            const value = op === "clear" ? null : op === "markLogin" ? { ...cur.value!, needsLogin: true } : record(tokens!, op === "renew" ? cur.value : null);
            const same = op === "renew" && !!cur.generation && value?.accountId === cur.value?.accountId;
            const generation = !value || value.needsLogin || !value.accountId ? null : same ? cur.generation : crypto.randomUUID();
            if (value) await ctx.fns.secrets.putLocal({ namespace, name, value: JSON.stringify(value), source: `codex-${op}` });
            else await ctx.fns.secrets.deleteLocal({ namespace, name });
            const invalidate = !same;
            await ctx.fns.procs.db.run({ sql: `UPDATE llm_connections SET codex_generation=?, codex_refresh_owner=NULL,codex_refresh_until=NULL, codex_credential_revision=codex_credential_revision+1,
                ${invalidate ? "models_cache=NULL,models_cached_at=NULL,models_cache_generation=NULL," : ""}
                ${op === "clear" ? "codex_login_intent=NULL," : op === "store" ? "codex_login_intent='done:' || codex_login_intent," : ""}
                updated_at=GREATEST(updated_at+1,?) WHERE id=?`, params: [generation, Date.now(), conn.id] });
            if (invalidate) await ctx.fns.session.reconcileCodexControls({ connectionId: conn.id, generation: null, models: [] });
            committed = true;
            return result({ ...cur, value, generation, credentialRevision: cur.credentialRevision + 1 }, op === "renew");
        } });
        if (committed) try { await ctx.fns.procs.events.refresh({ topic: "llm-models", reason: "models-codex-auth" }); } catch { /* committed; UI may resync later */ }
        return out as Result;
    };
    if (opts.op === "nativeRead") {
        const proof = opts.proof;
        if (!proof || !ctx.state.models?.nativeSearchConnections?.has(conn) || ctx.state.models.nativeSearchReads?.get(proof) !== conn) throw changed();
        ctx.state.models.nativeSearchReads.delete(proof);
        const cur = await read(false); // SDK holds this connection's row lock; never renew here.
        if (cur.generation !== proof.generation || String(cur.credentialRevision) !== proof.revision || !cur.value?.accountId || !cur.value.accessToken || cur.value.needsLogin || !(cur.value.expiresAt > Date.now() + 60_000)) throw changed();
        return result(cur, true);
    }
    if (opts.op !== 'markLogin' && ctx.state.models?.nativeSearchConnections?.has(conn)) throw changed();
    if (opts.op === "store" && !opts.tokens) throw new Error("Tokens required");
    if (opts.op === "clear" || opts.op === "store" || opts.op === "markLogin") return mutate(opts.op, opts.tokens, opts.auth);
    const cur = await read(false);
    if (opts.op === "status") return result(cur);
    const loginRequired = () => fail("Codex login required", "LOGIN_REQUIRED");
    if (!cur.value?.accessToken || cur.value.needsLogin) throw loginRequired();
    if (cur.value.expiresAt > Date.now() + 60_000) return result(cur, true);
    const refreshToken = cur.value.refreshToken;
    const inflight = ((ctx.state.models ??= {}).codexBoundRefresh ??= {});
    const key = JSON.stringify([conn.id, cur.generation, cur.credentialRevision]);
    return inflight[key] ??= (async () => {
        const owner = crypto.randomUUID();
        // The short DB claim coalesces refreshes across workers without holding a pool
        // connection during network I/O. Deadline precedes lease expiry; an old owner
        // cannot commit after takeover. Logout/login never wait for the network.
        for (;;) {
            const rows = await ctx.fns.procs.db.select({ sql: `UPDATE llm_connections SET codex_refresh_owner=?,
                codex_refresh_until=(extract(epoch FROM clock_timestamp())*1000)::bigint+65000
                WHERE id=? AND codex_generation IS NOT DISTINCT FROM ? AND codex_credential_revision=?
                AND (codex_refresh_owner IS NULL OR codex_refresh_until<(extract(epoch FROM clock_timestamp())*1000)::bigint) RETURNING id`,
                params: [owner, conn.id, cur.generation, cur.credentialRevision] });
            if (rows.length) break;
            const winner = await read(false);
            if (winner.generation !== cur.generation) throw changed();
            if (winner.credentialRevision !== cur.credentialRevision) {
                if (cur.generation && winner.value && !winner.value.needsLogin && winner.value.expiresAt > Date.now()+60_000) return result(winner,true);
                throw changed();
            }
            await Bun.sleep(80);
        }
        try {
            if (!refreshToken) { await mutate("markLogin", undefined, cur, owner); throw loginRequired(); }
            if (!('fetch' in conn)) throw changed();
            const res = await conn.fetch("https://auth.openai.com/oauth/token", { method: "POST", signal: AbortSignal.timeout(60_000),
                headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
                body: new URLSearchParams({ grant_type: "refresh_token", client_id: "app_EMoamEEZ73f0CkXaXp7hrann", refresh_token: refreshToken }).toString() });
            if (!res.ok) {
                await res.body?.cancel().catch(() => undefined);
                if (res.status === 400 || res.status === 401) { await mutate("markLogin", undefined, cur, owner); throw loginRequired(); }
                throw Object.assign(new Error(`Codex token refresh failed with HTTP ${res.status}`), { code: "REFRESH_FAILED", status: 502 });
            }
            return await mutate("renew", await res.json() as NonNullable<typeof opts.tokens>, cur, owner);
        } finally {
            await ctx.fns.procs.db.run({ sql: 'UPDATE llm_connections SET codex_refresh_owner=NULL,codex_refresh_until=NULL WHERE id=? AND codex_refresh_owner=?', params: [conn.id,owner] });
        }
    })().finally(() => { delete inflight[key]; });
}
