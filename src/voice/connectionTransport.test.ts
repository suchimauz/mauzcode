import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import load from "./$loader_voiceProvider";
import api from "./http/api";

// Per-connection voice transports: declarations, storage, validation, stale references and the settings API.
// Fixture provider, fake key, isolated database; no network is ever contacted.
const KEY = "fixture-transport-secret-0123456789";
const PROXY_SECRET = "proxy-password-fixture";
const OWNER = "voice-transport-owner";

function definition(extra: Partial<types.voice.ProviderDefinition> = {}): types.voice.ProviderDefinition {
    return {
        id: "acme-voice",
        label: "Acme Voice",
        destination: { kind: "cloud", label: "Acme (acme.invalid)" },
        fields: [{ key: "apiKey", label: "API key", type: "secret", required: true }, { key: "region", label: "Region", type: "text" }],
        models: [{ id: "acme-live", capabilities: { turnDetection: "client", sampleRates: [24000] } }],
        test: async () => ({ status: "available", reason: "voice-ok", message: "ok", checkedAt: 1 }),
        open: async () => { throw new Error("no session"); },
        ...extra,
    };
}

async function setup(extra: Partial<types.voice.ProviderDefinition> = { transports: ["direct", "socks", "ssh-tunnel"] }) {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString("base64") } });
    ctx.state.voice ??= {};
    ctx.state.voice.providers = {
        "acme-voice": { owner: "core", module: "voice", rel: "voice/$voiceProvider_acme-voice.ts", abs: "/app/src/voice/$voiceProvider_acme-voice.ts", definition: definition(extra) },
    };
    const proxyId = crypto.randomUUID();
    const now = Date.now();
    await ctx.fns.procs.db.run({ sql: "INSERT INTO socks_proxies(id,name,host,port,revision,created_at,updated_at) VALUES (?,?,?,?,1,?,?)", params: [proxyId, "office", "127.0.0.1", 1080, now, now] });
    const instances: types.sshInstance.Instance[] = [
        { name: "builder", pinnedHostKey: "ssh-ed25519 AAAA" } as types.sshInstance.Instance,
        { name: "unpinned" } as types.sshInstance.Instance,
    ];
    ctx.state.registry.sshInstance.list = async () => instances;
    ctx.state.registry.sshInstance.get = async (_c: unknown, _s: unknown, o: { name: string }) => {
        const found = instances.find(i => i.name === o.name);
        if (!found) throw new Error("Unknown SSH instance");
        return found;
    };
    let n = 0;
    const create = (over: Record<string, unknown> = {}) => ctx.fns.voice.create({ provider: "acme-voice", accountName: `acct-${n++}`, secrets: { apiKey: KEY }, ...over });
    return { ctx, proxyId, instances, create };
}

beforeAll(async () => { await mkTestCtx(); }, 60000);

describe("transport declarations", () => {
    test("an undeclared provider is direct-only in the catalogue; a declared list is exposed as is", async () => {
        const legacy = await setup({});
        expect(legacy.ctx.fns.voice.providers({})[0]!.transports).toEqual(["direct"]);
        const routed = await setup();
        expect(routed.ctx.fns.voice.providers({})[0]!.transports).toEqual(["direct", "socks", "ssh-tunnel"]);
    });

    test("the loader rejects empty, duplicate and unknown transport kinds without echoing them", async () => {
        const ctx = await mkTestCtx();
        ctx.state.voice = { providers: {} };
        const root = ctx.fns.procs.modules.list({})[0]!;
        const entry = (transports: unknown) => ({
            kind: "voiceProvider", name: "acme-voice", rel: "voice/$voiceProvider_acme-voice.ts", abs: `${root.dir}/voice/$voiceProvider_acme-voice.ts`,
            moduleDir: "voice", root: root.name, rootDir: root.dir, mod: { default: { ...definition(), transports } },
        });
        for (const bad of [[], ["direct", "direct"], ["http-proxy"], "socks"]) {
            const result = await load(ctx, null, { entries: [entry(bad)] });
            expect(result.registered).toEqual([]);
            expect(result.rejected[0]!.message).toBe("voiceProvider transports must be a nonempty list of distinct direct, socks or ssh-tunnel kinds");
        }
        expect((await load(ctx, null, { entries: [entry(["socks", "direct"])] })).registered).toEqual(["acme-voice"]);
    });
});

describe("connection transport storage", () => {
    test("a legacy row without a transport projects and resolves as direct", async () => {
        const { ctx, create } = await setup({});
        const view = await create();
        await ctx.fns.procs.db.run({ sql: "UPDATE voice_connections SET transport=NULL WHERE id=?", params: [view.id] });
        expect((await ctx.fns.voice.get({ id: view.id })).transport).toEqual({ kind: "direct" });
        const { conn } = await ctx.fns.voice.connections.resolve({ id: view.id });
        expect(conn.transport).toEqual({ kind: "direct" });
        expect(typeof conn.fetch).toBe("function");
        expect(typeof conn.openWebSocket).toBe("function");
        // Unrelated edits keep it untouched.
        await ctx.fns.voice.update({ id: view.id, accountName: "renamed", config: { region: "eu" } });
        const row = (await ctx.fns.procs.db.select({ sql: "SELECT transport FROM voice_connections WHERE id=?", params: [view.id] }))[0]!;
        expect(row.transport).toBeNull();
    });

    test("saved references round-trip apart from the configuration and survive unrelated edits", async () => {
        const { ctx, proxyId, create } = await setup();
        const socks = await create({ transport: { kind: "socks", proxyId }, config: { region: "eu" } });
        expect(socks.transport).toEqual({ kind: "socks", proxyId });
        expect(socks.config).toEqual({ region: "eu" });
        const ssh = await create({ transport: { kind: "ssh-tunnel", instance: "builder" } });
        expect(ssh.transport).toEqual({ kind: "ssh-tunnel", instance: "builder" });
        const renamed = await ctx.fns.voice.update({ id: socks.id, accountName: "renamed", config: { region: "us" }, secrets: { apiKey: "new-fixture-key" } });
        expect(renamed.transport).toEqual({ kind: "socks", proxyId });
        const row = (await ctx.fns.procs.db.select({ sql: "SELECT config, transport FROM voice_connections WHERE id=?", params: [socks.id] }))[0]!;
        expect(JSON.stringify(row.config)).not.toContain(proxyId);
        expect(row.transport).toEqual({ kind: "socks", proxyId });
        const switched = await ctx.fns.voice.update({ id: socks.id, transport: { kind: "direct" } });
        expect(switched.transport).toEqual({ kind: "direct" });
    });

    test("unsupported kinds, inline credentials and unknown references fail without changing the connection", async () => {
        const { ctx, proxyId, create } = await setup({ transports: ["direct", "socks"] });
        const view = await create();
        const before = await ctx.fns.voice.get({ id: view.id });
        const attempts: unknown[] = [
            { kind: "ssh-tunnel", instance: "builder" },
            { kind: "http", url: "http://proxy" },
            { kind: "socks", proxyId, password: PROXY_SECRET },
            { kind: "socks", host: "10.0.0.1", port: 1080, username: "u", password: PROXY_SECRET },
            { kind: "socks", proxyId: crypto.randomUUID() },
            { kind: "socks", proxyId: "not-a-uuid" },
            "direct",
        ];
        for (const transport of attempts) {
            const error = await ctx.fns.voice.update({ id: view.id, accountName: "changed", transport: transport as types.voice.TransportSpec }).catch((e: any) => e);
            expect(error).toMatchObject({ code: "VALIDATION", field: "transport" });
            expect(String(error.message)).not.toContain(PROXY_SECRET);
            expect(String(error.message)).not.toContain("10.0.0.1");
            await expect(create({ transport })).rejects.toMatchObject({ code: "VALIDATION", field: "transport" });
        }
        expect(await ctx.fns.voice.get({ id: view.id })).toEqual(before);
    });

    test("an SSH instance must exist and have a pinned host key", async () => {
        const { create } = await setup();
        await expect(create({ transport: { kind: "ssh-tunnel", instance: "unpinned" } })).rejects.toMatchObject({ code: "VALIDATION", field: "transport" });
        await expect(create({ transport: { kind: "ssh-tunnel", instance: "missing" } })).rejects.toMatchObject({ code: "VALIDATION", field: "transport" });
    });

    test("a stale reference is kept, re-saving it unchanged is allowed, and routed calls fail without a direct attempt", async () => {
        const { ctx, proxyId, create } = await setup();
        const view = await create({ transport: { kind: "socks", proxyId } });
        await ctx.fns.procs.db.run({ sql: "DELETE FROM socks_proxies WHERE id=?", params: [proxyId] });
        expect((await ctx.fns.voice.get({ id: view.id })).transport).toEqual({ kind: "socks", proxyId });
        const kept = await ctx.fns.voice.update({ id: view.id, accountName: "still-here", transport: { kind: "socks", proxyId } });
        expect(kept.transport).toEqual({ kind: "socks", proxyId });
        const original = globalThis.fetch;
        let direct = 0;
        globalThis.fetch = (async () => { direct++; return new Response("direct"); }) as unknown as typeof fetch;
        try {
            const { conn } = await ctx.fns.voice.connections.resolve({ id: view.id });
            await expect(conn.fetch("https://acme.invalid/models")).rejects.toMatchObject({ code: "TRANSPORT" });
            const ws = conn.openWebSocket("wss://acme.invalid/live");
            const closed = await new Promise<{ error?: string; code: number }>(resolve => {
                let error: string | undefined;
                ws.addEventListener("error", (e: Event) => { error = (e as ErrorEvent).message; });
                ws.addEventListener("close", (e: Event) => resolve({ error, code: (e as CloseEvent).code }));
            });
            expect(closed).toEqual({ error: "Voice transport is unavailable", code: 1006 });
        } finally { globalThis.fetch = original; }
        expect(direct).toBe(0);
    });

    test("routed clients refuse plain-text destinations instead of sending them unprotected", async () => {
        const { ctx, proxyId, create } = await setup();
        const view = await create({ transport: { kind: "socks", proxyId } });
        const { conn } = await ctx.fns.voice.connections.resolve({ id: view.id });
        await expect(conn.fetch("http://acme.invalid/models")).rejects.toMatchObject({ code: "TRANSPORT" });
        expect(() => conn.openWebSocket("ws://acme.invalid/live")).toThrow("Routed voice WebSockets require wss");
        expect(() => conn.openWebSocket("wss://acme.invalid/live", { headers: { Upgrade: "h2c" } })).toThrow("Invalid or reserved WebSocket header");
    });
});

describe("settings API", () => {
    test("exposes route choices without credentials and round-trips the selection", async () => {
        const { ctx, proxyId } = await setup();
        await ctx.fns.secrets.putLocal({ namespace: "socksProxy", name: proxyId, value: JSON.stringify({ username: "u", password: PROXY_SECRET }), source: "test" });
        await ctx.fns.procs.db.run({ sql: "UPDATE socks_proxies SET credential_ref=? WHERE id=?", params: [`secret://socksProxy/${proxyId}`, proxyId] });
        ctx.state.registry.auth.verifyCsrf = async (_c: unknown, _s: unknown, o: { token: string }) => o.token === "good";
        ctx.state.registry.auth.csrfToken = async () => "good";
        const owner = { user: { id: OWNER, role: "owner" } } as unknown as Session;
        const post = async (body: unknown) => (await api(ctx, owner, { req: new Request("http://local/voice/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-csrf-token": "good" } }) }));
        const state = await (await api(ctx, owner, { req: new Request("http://local/voice/api") })).json() as any;
        expect(state.proxies).toEqual([{ id: proxyId, name: "office", host: "127.0.0.1", port: 1080 }]);
        expect(state.instances).toEqual(["builder"]);
        expect(state.providers[0].transports).toEqual(["direct", "socks", "ssh-tunnel"]);
        const created = await post({ action: "create", provider: "acme-voice", accountName: "api", secrets: { apiKey: KEY }, transport: { kind: "ssh-tunnel", instance: "builder" } });
        expect(created.status).toBe(201);
        const { connection } = await created.json() as any;
        expect(connection.transport).toEqual({ kind: "ssh-tunnel", instance: "builder" });
        const renamed = await (await post({ action: "update", id: connection.id, accountName: "api-2", config: {} })).json() as any;
        expect(renamed.connection.transport).toEqual({ kind: "ssh-tunnel", instance: "builder" });
        const rejected = await post({ action: "update", id: connection.id, transport: { kind: "socks", proxyId, password: PROXY_SECRET } });
        expect(rejected.status).toBe(400);
        const text = JSON.stringify([state, await rejected.json()]);
        expect(text).not.toContain(PROXY_SECRET);
        expect(text).not.toContain(KEY);
        expect(text).not.toContain("secret://");
    });
});
