import { expect, test } from "bun:test";

const groups = {
    connections: ["action", "cached", "create", "get", "list", "remove", "resolve", "safeMessage", "test", "toView", "update", "usage", "validateConfig"],
    inference: ["assertModelEnabled", "checkInput", "compact", "failure", "resolveReasoning", "stream"],
};

for (const [group, names] of Object.entries(groups)) for (const name of names) {
    test(`models.${name} delegates once with unchanged options, result and error identity`, async () => {
        const root = (await import(`../${name}.ts`)).default;
        const sync = ["safeMessage", "toView", "checkInput", "failure", "resolveReasoning"].includes(name);
        const signal = new AbortController().signal;
        const onEvent = () => undefined;
        const opts = { signal, onEvent, marker: Symbol(name) };
        const result = { marker: Symbol("result") };
        const error = new Error("fixture failure");
        let count = 0;
        const ctx = { fns: { models: { [group]: { [name]: (received: unknown) => {
            expect(received).toBe(opts);
            count++;
            return result;
        } } } } };
        const returned = root(ctx, null, opts);
        expect(returned instanceof Promise).toBe(!sync);
        expect(await returned).toBe(result);
        expect(count).toBe(1);
        ctx.fns.models[group]![name] = () => { throw error; };
        if (sync) {
            let caught: unknown;
            try { root(ctx, null, opts); } catch (failure) { caught = failure; }
            expect(caught).toBe(error);
        } else {
            await expect(root(ctx, null, opts)).rejects.toBe(error);
        }
    });
}

for (const path of ["../cached.ts", "./cached.ts"]) test(`${path}: shared root health state, revision invalidation and failed check eviction`, async () => {
    const cached = (await import(path)).default;
    const ctx: any = { state: { models: { health: {} } }, fns: { models: { connections: {} } } };
    const leaf = (await import("./cached.ts")).default;
    ctx.fns.models.connections.cached = (opts: Parameters<typeof leaf>[2]) => leaf(ctx, null, opts);
    const health = ctx.state.models.health;
    let runs = 0;
    let finish!: (value: unknown) => void;
    const run = () => { runs++; return new Promise(resolve => { finish = resolve; }); };
    const opts = { connection: { id: "fixture", updatedAt: 1 }, kind: "test", run };
    const first = cached(ctx, null, opts), second = cached(ctx, null, opts);
    expect(runs).toBe(1);
    const result = { status: "available", checkedAt: 1 };
    finish(result);
    expect(await first).toBe(result);
    expect(await second).toBe(result);
    expect(await cached(ctx, null, opts)).toBe(result);
    expect(ctx.state.models.health).toBe(health);
    expect(ctx.state.models.connections).toBeUndefined();
    const failure = new Error("offline failure");
    await expect(cached(ctx, null, { ...opts, connection: { id: "fixture", updatedAt: 2 }, run: async () => { throw failure; } })).rejects.toBe(failure);
    expect(Object.keys(health)).toHaveLength(0);
});

for (const path of ["../resolve.ts", "./resolve.ts"]) test(`${path}: resolution limits secrets to declared connection fields and preserves saved transport`, async () => {
    const resolve = (await import(path)).default;
    const leaf = (await import("./resolve.ts")).default;
    const signal = new AbortController().signal;
    const transport = { kind: "socks", proxyId: "saved-proxy" };
    const definition = { fields: [{ key: "token", type: "secret" }, { key: "unset", type: "secret" }] };
    const view = { id: "connection-one", provider: "fixture", accountName: "work", config: { nested: { value: 1 } }, secrets: { token: true }, transport, enabled: true };
    const secrets: unknown[] = [], requests: unknown[] = [];
    const ctx: any = { state: { models: { providers: { fixture: { definition } } } }, fns: {
        models: { get: async () => view, connections: {}, fetch: (opts: unknown) => { requests.push(opts); return Promise.resolve(new Response("ok")); } },
        secrets: { getLocal: async (opts: unknown) => { secrets.push(opts); return "fixture-value"; } },
    } };
    ctx.fns.models.connections.resolve = (opts: Parameters<typeof leaf>[2]) => leaf(ctx, null, opts);
    const result = await resolve(ctx, null, { id: view.id, signal, timeoutMs: 1234 });
    expect(result.definition).toBe(definition);
    expect(await result.conn.secret("token")).toBe("fixture-value");
    expect(await result.conn.secret("unset")).toBeNull();
    expect(await result.conn.secret("other-connection.token")).toBeNull();
    expect(secrets).toEqual([{ namespace: "models", name: "connection-one.token" }]);
    result.conn.config.nested.value = 2;
    expect(view.config.nested.value).toBe(1);
    const init = { method: "POST" };
    await result.conn.fetch("https://fixture.example", init);
    expect(requests).toEqual([{ transport, url: "https://fixture.example", init, signal, timeoutMs: 1234 }]);
});
