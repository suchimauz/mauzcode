import { beforeAll, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

beforeAll(async () => { await mkTestCtx(); }, 60000);
async function setup() {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString("base64") } });
    ctx.state.models.providers = {};
    for (const id of ["acme", "other"]) ctx.state.models.providers[id] = { owner: "core", module: "models", rel: "fixture", definition: { id, label: id, transports: ["direct"], fields: [{ key: "token", type: "secret", label: "Token" }], test: async () => ({}) } };
    const events: object[] = [];
    ctx.state.registry.procs.events.emit = (_c: unknown, _s: unknown, o: { event: { type: string } }) => { if (o.event.type === "models.connectionRenamed") events.push(o.event); };
    const create = (accountName: string, provider = "acme") => ctx.fns.models.create({ provider, accountName, secrets: { token: "original" } });
    const snapshot = () => ctx.fns.procs.db.select({ sql: "SELECT * FROM llm_connections ORDER BY id", params: [] });
    return { ctx, events, create, snapshot };
}

test("invalid separators and duplicate provider/account store nothing, same account on another provider succeeds", async () => {
    const { ctx, create, snapshot, events } = await setup();
    const a = await create("work");
    const b = await create("other");
    const before = await snapshot();
    for (const name of ["team/main", "team:main", "work"]) {
        await expect(create(name)).rejects.toMatchObject({ code: "VALIDATION", field: "accountName" });
        await expect(ctx.fns.models.update({ id: b.id, accountName: name, secrets: { token: "changed" }, config: { models: ["changed"] } })).rejects.toMatchObject({ code: "VALIDATION", field: "accountName" });
    }
    expect(await snapshot()).toEqual(before);
    expect(await ctx.fns.secrets.getLocal({ namespace: "models", name: `${b.id}.token` })).toBe("original");
    expect(events).toEqual([]);
    expect((await create("work", "other")).provider).toBe("other");
    expect(await ctx.fns.models.get({ id: a.id })).toEqual(a);
});

test("unique index rejects races and translates violation with transaction rollback", async () => {
    const { ctx, create, snapshot, events } = await setup();
    await create("work");
    const b = await create("other");
    const before = await snapshot();
    const original = ctx.state.registry.procs.db.select;
    // Simulate a stale duplicate precheck: the real unique index remains authoritative.
    ctx.state.registry.procs.db.select = (c: Context, s: Session | null, o: { sql: string }) => o.sql.startsWith("SELECT id FROM llm_connections WHERE provider=") ? [] : original(c, s, o);
    await expect(create("work")).rejects.toMatchObject({ code: "VALIDATION", field: "accountName" });
    await expect(ctx.fns.models.update({ id: b.id, accountName: "work", secrets: { token: "changed" } })).rejects.toMatchObject({ code: "VALIDATION", field: "accountName" });
    expect(await snapshot()).toEqual(before);
    expect(await ctx.fns.secrets.getLocal({ namespace: "models", name: `${b.id}.token` })).toBe("original");
    const secrets = await ctx.fns.procs.db.select({ sql: "SELECT name FROM local_secrets WHERE namespace='models'", params: [] });
    expect(secrets).toHaveLength(2);
    expect(events).toEqual([]);
});

test("rename changes only model localization and publishes committed from/to; no-op emits nothing", async () => {
    const { ctx, create, events } = await setup();
    const c = await create("old");
    await ctx.fns.settings.set({ module: "models", scopeType: "global", key: "localizationModel", value: "acme/old:org/model:v2" });
    const writes: string[] = [];
    const run = ctx.state.registry.procs.db.run;
    ctx.state.registry.procs.db.run = (c: Context, s: Session | null, o: { sql: string }) => { writes.push(o.sql); if (/\b(agents|kv)\b/i.test(o.sql)) throw Error("Cross-module write"); return run(c, s, o); };
    let committed = false;
    const transaction = ctx.state.registry.procs.db.transaction;
    ctx.state.registry.procs.db.transaction = async (c: Context, s: Session | null, o: object) => { const result = await transaction(c, s, o); committed = true; return result; };
    const emit = ctx.state.registry.procs.events.emit;
    ctx.state.registry.procs.events.emit = (c: Context, s: Session | null, o: { event: { type: string } }) => { if (o.event.type === "models.connectionRenamed") expect(committed).toBe(true); return emit(c, s, o); };
    await ctx.fns.models.update({ id: c.id, accountName: "new name" });
    expect(await ctx.fns.settings.get({ module: "models", scopeType: "global", key: "localizationModel" })).toBe("acme/new name:org/model:v2");
    expect(events).toEqual([{ type: "models.connectionRenamed", provider: "acme", from: "old", to: "new name" }]);
    await ctx.fns.models.update({ id: c.id, accountName: "new name" });
    expect(events).toHaveLength(1);
    expect(writes.some(sql => /\b(agents|kv)\b/i.test(sql))).toBe(false);
});

test("rename event uses locked current account, not a stale initial view", async () => {
    const { ctx, create, events } = await setup();
    const c = await create("old");
    // Deterministic interleaving: another committed rename between initial view and row lock.
    const get = ctx.state.registry.models.connections.get;
    let injected = false;
    ctx.state.registry.models.connections.get = async (raw: Context, session: Session | null, opts: { id: string }) => {
        const view = await get(raw, session, opts);
        if (!injected) { injected = true; await raw.fns.procs.db.run({ sql: "UPDATE llm_connections SET account_name='intermediate' WHERE id=?", params: [c.id] }); }
        return view;
    };
    await ctx.fns.models.update({ id: c.id, accountName: "final" });
    expect(events).toEqual([{ type: "models.connectionRenamed", provider: "acme", from: "intermediate", to: "final" }]);
});
