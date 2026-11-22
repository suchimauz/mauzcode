import { beforeAll, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

const jwt = (id?: string, expired = false, tag = "") => `mock.${Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now()/1000) + (expired ? 1 : 3600), tag,
    "https://api.openai.com/auth": { chatgpt_account_id: id, organizations: [{ id: "not-selected" }] },
})).toString("base64url")}.mock`;
const deferred = <T>() => { let resolve!: (val: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; };
const ctxOf = () => mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64") } });
beforeAll(async () => { await ctxOf(); }, 60000);
async function fixture(fetch: (url: string) => Response | Promise<Response>) {
    const c = await ctxOf(), other = await ctxOf(), id = crypto.randomUUID();
    await c.fns.procs.db.run({ sql: "INSERT INTO llm_connections(id,provider,account_name,created_at,updated_at) VALUES(?,'codex','fixture',1,1)", params: [id] });
    const conn = { id, fetch };
    const auth = (ctx: any, op: string, args: object = {}) => ctx.fns.models.provider.codex.codexAuth({ conn, op, ...args });
    const store = async (ctx: any, account: string, expired = false) => {
        const intent = crypto.randomUUID();
        await ctx.fns.procs.db.run({ sql: 'UPDATE llm_connections SET codex_login_intent=? WHERE id=?', params: [intent,id] });
        return auth(ctx, "store", { intent, tokens: { access_token: jwt(account, expired), id_token: jwt(account), refresh_token: "mock-renew" } });
    };
    const tuple = (ctx: any) => ctx.fns.models.provider.codex.codexWireAuth({ conn });
    const login = (ctx: any, op: string) => ctx.fns.models.provider.codex.codexLogin({ conn, op, intervalMs: 1 });
    const saveFast = async (generation: string) => {
        const db = c.fns.procs.db;
        await db.run({ sql: "INSERT INTO agents(id,model,created_at,updated_at) VALUES('auth-chat','mock:test',1,1)" });
        await db.run({ sql: "UPDATE llm_connections SET models_cache='[{\"id\":\"m\"}]',models_cached_at=9,models_cache_generation=? WHERE id=?", params: [generation,id] });
        await db.run({ sql: "INSERT INTO codex_control_revisions(agent_id,connection_id,model_id,revision) VALUES('auth-chat',?,'m',1)", params: [id] });
        await db.run({ sql: "INSERT INTO codex_control_choices(agent_id,connection_id,model_id,generation,speed) VALUES('auth-chat',?,'m',?,'fast')", params: [id,generation] });
    };
    const state = async () => (await c.fns.procs.db.select({ sql: `SELECT models_cached_at AS cache, (SELECT count(*)::int FROM codex_control_notices) AS notices,
        (SELECT speed FROM codex_control_choices WHERE connection_id=c.id) AS speed FROM llm_connections c WHERE id=?`, params: [id] }))[0];
    return { c, other, id, conn, auth, store, tuple, login, saveFast, state };
}

for (const kind of ["matching", "replacement", "missing", "conflicting"]) test(`renewal uses only fresh identity: ${kind}`, async () => {
    const account = kind === "missing" ? undefined : kind === "replacement" ? "B" : "A";
    const token = jwt(account, false, "renewal");
    const f = await fixture(() => Response.json({ access_token: token, ...(kind === "conflicting" ? { id_token: jwt("B") } : {}) }));
    const saved = await f.store(f.c, "A", true);
    await f.saveFast(saved.generation);
    const issued = await f.tuple(f.other);
    expect(Object.isFrozen(issued)).toBe(true);
    expect(issued).toEqual({ token, accountId: kind === "conflicting" ? null : account ?? null,
        generation: kind === "matching" ? saved.generation : kind === "replacement" ? expect.any(String) : null, credentialRevision: saved.credentialRevision + 1 });
    if (kind !== "matching") expect(issued.generation).not.toBe(saved.generation);
    // Delayed Responses failure for the pre-renewal revision must not reset the new token (even for A -> A).
    await expect(f.c.fns.models.provider.codex.codexWireChecked({ conn: f.conn, auth: saved, res: new Response(null, { status: 401 }) })).rejects.toThrow();
    expect(await f.auth(f.c, "status")).toMatchObject({ loggedIn: true, generation: issued.generation, credentialRevision: issued.credentialRevision });
    const s = await f.state();
    expect([s.speed,Number(s.cache),s.notices]).toEqual(kind === "matching" ? ["fast",9,0] : [null,0,1]);
});

test("two workers share one renewal and each gets the complete new tuple", async () => {
    const started = deferred<void>(), waiting = deferred<void>(), release = deferred<Response>(); let count = 0;
    const f = await fixture(() => { ++count; started.resolve(); return release.promise; });
    const a = await f.store(f.c, "A", true), first = f.tuple(f.c); await started.promise;
    const db = f.other.state.registry.procs.db, real = db.select;
    db.select = async (ctx:any,sess:any,opts:any) => {
        const out = await real(ctx,sess,opts);
        if (opts.sql.includes('UPDATE llm_connections SET codex_refresh_owner=') && !out.length) waiting.resolve();
        return out;
    };
    const second = f.tuple(f.other); await waiting.promise;
    const token = jwt('A',false,'new'); release.resolve(Response.json({access_token:token}));
    const tuples = await Promise.all([first,second]);
    for (const t of tuples) expect(t).toEqual({token,accountId:'A',generation:a.generation,credentialRevision:a.credentialRevision+1});
    expect(count).toBe(1);
});

for (const status of [200,401]) test(`late refresh HTTP ${status} cannot mutate a recreated version-one credential`, async () => {
    const started = deferred<void>(), release = deferred<Response>();
    const f = await fixture(() => { started.resolve(); return release.promise; });
    const a = await f.store(f.c, "A", true);
    const late = f.tuple(f.c); await started.promise;
    await f.auth(f.other, "clear");
    const b = await f.store(f.other, "B");
    expect(b.generation).not.toBe(a.generation);
    const [{ version }] = await f.c.fns.procs.db.select({ sql: "SELECT version FROM local_secrets WHERE namespace='models' AND name=?", params: [f.id + '.codex-auth'] });
    expect(Number(version)).toBe(1);
    // A waiter in the same worker must not join A's refresh after the B login.
    const newTuple = await f.tuple(f.c);
    expect(newTuple).toEqual({ accountId: "B", token: expect.any(String), credentialRevision: b.credentialRevision, generation: b.generation });
    expect(JSON.parse(Buffer.from(newTuple.token.split('.')[1], 'base64url').toString())["https://api.openai.com/auth"].chatgpt_account_id).toBe("B");
    await f.saveFast(b.generation);
    release.resolve(Response.json({ access_token: jwt("A") }, {status}));
    await expect(late).rejects.toMatchObject({code: status === 401 ? "LOGIN_REQUIRED" : "CREDENTIAL_CHANGED"});
    await expect(f.other.fns.models.provider.codex.codexWireChecked({ conn: f.conn, auth: a, res: new Response(null, {status:401}) })).rejects.toThrow();
    expect(await f.tuple(f.c)).toEqual(newTuple);
    const s = await f.state(); expect([s.speed,Number(s.cache),s.notices]).toEqual(["fast",9,0]);
});

for (const action of ["start", "cancel", "logout"]) test(`durable login intent fenced before user-code response: ${action}`, async () => {
    const started = deferred<void>(), release = deferred<Response>(); let requests = 0;
    const code = (user_code: string) => Response.json({ device_auth_id: "device", user_code });
    const f = await fixture(url => {
        if (url.endsWith("/usercode") && !requests++) { started.resolve(); return release.promise; }
        if (url.endsWith("/usercode")) return code("new");
        if (url.endsWith("/deviceauth/token")) return Response.json({authorization_code:"mock-code",code_verifier:"mock-verifier"});
        return Response.json({ access_token: jwt("B") });
    });
    const slow = f.login(f.c,"start"); await started.promise;
    if (action === "logout") await f.other.fns.models.provider.codex.codexLogout({ conn: f.conn });
    else await f.login(f.other,action);
    release.resolve(code("old"));
    await expect(slow).rejects.toMatchObject({code:"LOGIN_SUPERSEDED"});
    if (action === "start") {
        await f.other.state.models.loginFlows[f.id].done;
        expect(await f.login(f.other,"status")).toMatchObject({ userCode:"new",status:"succeeded" });
        expect((await f.tuple(f.c)).accountId).toBe("B");
    } else expect((await f.auth(f.c,"status")).loggedIn).toBe(false);
});

test("logout on another worker between exchange and persistence rejects the stale intent", async () => {
    const reached = deferred<void>(), resume = deferred<void>();
    const f = await fixture(url => Response.json(url.endsWith("/usercode") ? { device_auth_id:"mock",user_code:"code" } : url.endsWith("/deviceauth/token") ? {authorization_code:"mock",code_verifier:"mock"} : {access_token:jwt("A")}));
    const reg = f.c.state.registry.models.provider.codex, real = reg.codexAuth;
    reg.codexAuth = async (ctx: any, sess: any, opts: any) => { if (opts.op === "store") { reached.resolve(); await resume.promise; } return real(ctx,sess,opts); };
    await f.login(f.c,"start"); await reached.promise;
    await f.other.fns.models.provider.codex.codexLogout({ conn: f.conn });
    resume.resolve(); await f.c.state.models.loginFlows[f.id].done;
    expect(await f.login(f.c,"status")).toMatchObject({status:"failed"});
    expect((await f.auth(f.other,"status")).loggedIn).toBe(false);
});
