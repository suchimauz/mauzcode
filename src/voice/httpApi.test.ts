import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import api from "./http/api";
import openai from "./$voiceProvider_openai-realtime";

// Task 3.1: the owner-only voice settings API behind the Voice tab and the per-chat selector. Fixture provider,
// fake key and isolated database only: no network, no audio and no provider session is ever opened.
const KEY = "fixture-voice-secret-0123456789";
const MARKER = "token=leaky-route-marker";
const OWNER = "voice-api-owner";

function definition(calls: { test: number; open: number }): types.voice.ProviderDefinition {
    return {
        id: "acme-voice",
        label: "Acme Voice",
        destination: { kind: "cloud", label: "Acme (acme.invalid)" },
        fields: [
            { key: "apiKey", label: "API key", type: "secret", required: true },
            { key: "baseUrl", label: "Base URL", type: "url", default: "https://acme.invalid/v1" },
        ],
        models: [{ id: "acme-live", label: "Acme Live", description: "Metered per audio minute.", capabilities: { turnDetection: "client", sampleRates: [24000] } }],
        test: async () => { calls.test++; return { status: "available", reason: "voice-ok", message: "ok", checkedAt: 1 }; },
        open: async () => { calls.open++; throw new Error("no session may be opened by the settings API"); },
    };
}

const owner = { user: { id: OWNER, role: "owner" } } as unknown as Session;
const member = { user: { id: "voice-api-member", role: "member" } } as unknown as Session;
// Parsed JSON of a response; the tests inspect several reply shapes.
const json = async (response: Response | Promise<Response>): Promise<any> => (await response).json();

async function setup() {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString("base64") } });
    await ctx.fns.settings.remove({ module: "voice", scopeType: "global", key: "defaultRoute" });
    const calls = { test: 0, open: 0 };
    ctx.state.voice ??= {};
    ctx.state.voice.providers = {
        "acme-voice": { owner: "core", module: "voice", rel: "voice/$voiceProvider_acme-voice.ts", abs: "/app/src/voice/$voiceProvider_acme-voice.ts", definition: definition(calls) },
    };
    ctx.state.registry.auth.verifyCsrf = async (_c: unknown, _s: unknown, o: { token: string }) => o.token === "good";
    ctx.state.registry.auth.csrfToken = async () => "good";
    const now = Date.now();
    await ctx.fns.procs.db.run({ sql: "INSERT INTO users (id, name, role, created_at, updated_at) VALUES (?, 'Owner', 'owner', ?, ?) ON CONFLICT (id) DO NOTHING", params: [OWNER, now, now] });
    const chat = async () => {
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.procs.db.run({ sql: "UPDATE agents SET created_by=? WHERE id=?", params: [OWNER, agent.id] });
        return agent.id as string;
    };
    const get = (query = "", session: Session | null = owner) => api(ctx, session, { req: new Request(`http://local/voice/api${query}`) });
    const post = (body: unknown, opts: { session?: Session | null; token?: string; type?: string; origin?: string } = {}) => api(ctx, opts.session === undefined ? owner : opts.session, {
        req: new Request("http://local/voice/api", {
            method: "POST", body: JSON.stringify(body),
            headers: { "content-type": opts.type ?? "application/json", "x-csrf-token": opts.token ?? "good", ...(opts.origin ? { origin: opts.origin } : {}) },
        }),
    });
    return { ctx, calls, chat, get, post };
}

beforeAll(async () => { await mkTestCtx(); }, 60000);

const noSecrets = (value: unknown) => {
    const text = JSON.stringify(value);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("secret://");
    expect(text).not.toContain(MARKER);
};

describe("voice settings API", () => {
    test("rejects anonymous, non-owner, missing CSRF, cross-origin and non-JSON writes", async () => {
        const { get, post } = await setup();
        expect((await get("", null)).status).toBe(401);
        expect((await get("", member)).status).toBe(403);
        const create = { action: "create", provider: "acme-voice", accountName: "work", secrets: { apiKey: KEY } };
        expect((await post(create, { session: member })).status).toBe(403);
        expect((await post(create, { token: "" })).status).toBe(403);
        expect((await post(create, { origin: "https://evil.example" })).status).toBe(403);
        expect((await post(create, { type: "text/plain" })).status).toBe(415);
    });

    test("unconfigured overview: no connections, no routes, empty default and an unconfigured chat", async () => {
        const { get, chat, calls } = await setup();
        const id = await chat();
        const body = await json(get(`?agentId=${id}`));
        expect(body.connections).toEqual([]);
        expect(body.routes).toEqual([]);
        expect(body.defaultRoute).toEqual({ route: "", fixed: false });
        expect(body.chat).toEqual({ agentId: id, route: "", source: "none", status: "unconfigured" });
        expect(body.providers.map((p: { id: string }) => p.id)).toEqual(["acme-voice"]);
        expect(body.csrfToken).toBe("good");
        expect(calls).toEqual({ test: 0, open: 0 });
    });

    test("connection CRUD and test stay secret-free; removal needs confirmation", async () => {
        const { post, get, calls } = await setup();
        const created = await post({ action: "create", provider: "acme-voice", accountName: "work", secrets: { apiKey: KEY } });
        expect(created.status).toBe(201);
        const { connection } = await json(created);
        expect(connection.secrets).toEqual({ apiKey: true });
        noSecrets(connection);
        const updated = await json(post({ action: "update", id: connection.id, accountName: "office" }));
        expect(updated.connection).toMatchObject({ accountName: "office", secrets: { apiKey: true } });
        const tested = await json(post({ action: "test", id: connection.id }));
        expect(tested.result).toMatchObject({ status: "available" });
        expect(calls).toEqual({ test: 1, open: 0 });
        const overview = await json(get());
        noSecrets(overview);
        expect(overview.routes).toEqual([{
            route: "acme-voice/office:acme-live", provider: "acme-voice", accountName: "office", connectionId: connection.id, modelId: "acme-live",
            label: "Acme Live", description: "Metered per audio minute.", destination: { kind: "cloud", label: "Acme (acme.invalid)" },
        }]);
        expect((await post({ action: "remove", id: connection.id })).status).toBe(400);
        expect((await post({ action: "remove", id: connection.id, confirmed: true })).status).toBe(200);
        expect((await json(get())).connections).toEqual([]);
        const invalid = await post({ action: "create", provider: "acme-voice", accountName: "x" });
        expect(invalid.status).toBe(400);
        expect(await json(invalid)).toMatchObject({ field: "apiKey" });
    });

    test("default route: stores only an available route, never echoes a rejected one, and clears", async () => {
        const { post, get, ctx } = await setup();
        await post({ action: "create", provider: "acme-voice", accountName: "work", secrets: { apiKey: KEY } });
        const bad = await post({ action: "setDefaultRoute", route: `acme-voice/missing:acme-live?${MARKER}` });
        expect(bad.status).toBe(409);
        noSecrets(await json(bad));
        expect((await post({ action: "setDefaultRoute", route: "acme-voice/nobody:acme-live" })).status).toBe(409);
        const ok = await json(post({ action: "setDefaultRoute", route: "acme-voice/work:acme-live" }));
        expect(ok.defaultRoute).toEqual({ route: "acme-voice/work:acme-live", fixed: false });
        expect(await ctx.fns.settings.get({ module: "voice", scopeType: "global", key: "defaultRoute" })).toBe("acme-voice/work:acme-live");
        expect((await json(get())).defaultRoute.route).toBe("acme-voice/work:acme-live");
        const cleared = await json(post({ action: "setDefaultRoute", route: "" }));
        expect(cleared.defaultRoute).toEqual({ route: "", fixed: false });
    });

    test("per-chat override: set, reported before capture, reset to default; other chats keep the default", async () => {
        const { post, get, chat, calls } = await setup();
        await post({ action: "create", provider: "acme-voice", accountName: "work", secrets: { apiKey: KEY } });
        await post({ action: "create", provider: "acme-voice", accountName: "home", secrets: { apiKey: KEY } });
        await post({ action: "setDefaultRoute", route: "acme-voice/work:acme-live" });
        const a = await chat(), b = await chat();
        expect((await json(get(`?agentId=${a}`))).chat).toMatchObject({ route: "acme-voice/work:acme-live", source: "default", status: "ready", destination: { kind: "cloud" } });
        const set = await json(post({ action: "setChatRoute", agentId: a, route: "acme-voice/home:acme-live" }));
        expect(set.chat).toMatchObject({ route: "acme-voice/home:acme-live", source: "override", status: "ready", model: { id: "acme-live", label: "Acme Live" } });
        expect((await json(get(`?agentId=${a}`))).chat.source).toBe("override");
        expect((await json(get(`?agentId=${b}`))).chat).toMatchObject({ route: "acme-voice/work:acme-live", source: "default" });
        expect((await post({ action: "setChatRoute", agentId: a, route: "acme-voice/none:acme-live" })).status).toBe(409);
        const reset = await json(post({ action: "clearChatRoute", agentId: a }));
        expect(reset.chat).toMatchObject({ route: "acme-voice/work:acme-live", source: "default" });
        expect(calls.open).toBe(0);
    });

    test("a broken selected route is reported as unavailable, not replaced", async () => {
        const { post, get, chat, ctx } = await setup();
        const { connection } = await json(post({ action: "create", provider: "acme-voice", accountName: "work", secrets: { apiKey: KEY } }));
        await post({ action: "setDefaultRoute", route: "acme-voice/work:acme-live" });
        await post({ action: "remove", id: connection.id, confirmed: true });
        const id = await chat();
        expect((await json(get(`?agentId=${id}`))).chat).toEqual({ agentId: id, route: "acme-voice/work:acme-live", source: "default", status: "unavailable", reason: "unknown-connection" });
        expect(await ctx.fns.settings.get({ module: "voice", scopeType: "global", key: "defaultRoute" })).toBe("acme-voice/work:acme-live");
    });

    test("chat access: foreign chats are not found and archived chats are read-only", async () => {
        const { post, get, chat, ctx } = await setup();
        await post({ action: "create", provider: "acme-voice", accountName: "work", secrets: { apiKey: KEY } });
        const foreign = await ctx.fns.agent.start({ model: "mock:test" });
        expect((await get(`?agentId=${foreign.id}`)).status).toBe(404);
        expect((await post({ action: "setChatRoute", agentId: foreign.id, route: "acme-voice/work:acme-live" })).status).toBe(404);
        const id = await chat();
        await ctx.fns.procs.db.run({ sql: "UPDATE agents SET archived_at=? WHERE id=?", params: [Date.now(), id] });
        expect((await get(`?agentId=${id}`)).status).toBe(200);
        const archived = await post({ action: "setChatRoute", agentId: id, route: "acme-voice/work:acme-live" });
        expect(archived.status).toBe(409);
        expect(await ctx.fns.voice.effectiveRoute({ agentId: id })).toEqual({ route: "", source: "none" });
    });
    test("the built-in adapter discloses the host and port of each connection's endpoint, before and at start", async () => {
        const { ctx, post, get, chat, calls } = await setup();
        ctx.state.voice!.providers!["openai-realtime"] = {
            owner: "core", module: "voice", rel: "voice/$voiceProvider_openai-realtime.ts", abs: "/app/src/voice/$voiceProvider_openai-realtime.ts", definition: openai,
        };
        await post({ action: "create", provider: "openai-realtime", accountName: "std", secrets: { apiKey: KEY } });
        const custom = "https://voice.example.test:8443/private/v1";
        await post({ action: "create", provider: "openai-realtime", accountName: "own", config: { baseUrl: custom }, secrets: { apiKey: KEY } });
        const body = await json(get());
        const by = (account: string) => body.routes.find((r: { accountName: string }) => r.accountName === account).destination;
        expect(by("std")).toEqual({ kind: "cloud", label: "OpenAI Realtime (api.openai.com)" });
        expect(by("own")).toEqual({ kind: "cloud", label: "Configured endpoint (voice.example.test:8443)" });
        expect(body.connections.find((c: { accountName: string }) => c.accountName === "own").destination).toEqual(by("own"));
        // Only host and port: the path of the configured URL never becomes part of the disclosure.
        expect(JSON.stringify(body.routes)).not.toContain("/private");
        // The chat picker and the session start (resolveRoute feeds `ready`) report the same destination.
        const id = await chat();
        await post({ action: "setChatRoute", agentId: id, route: "openai-realtime/own:gpt-live-transcribe" });
        expect((await json(get(`?agentId=${id}`))).chat.destination).toEqual(by("own"));
        expect((await ctx.fns.voice.resolveRoute({ route: "openai-realtime/std:gpt-live-transcribe" })).destination).toEqual(by("std"));
        expect((await ctx.fns.voice.resolveRoute({ route: "openai-realtime/own:gpt-live-transcribe" })).destination).toEqual(by("own"));
        noSecrets(body);
        expect(calls).toEqual({ test: 0, open: 0 });
    });

    test("an unsafe per-connection disclosure falls back to the declared destination", async () => {
        const { ctx, post, get } = await setup();
        const definition = ctx.state.voice!.providers!["acme-voice"]!.definition;
        definition.destinationFor = (config: Readonly<Record<string, types.voice.ConfigValue>>) => ({ kind: "cloud", label: `Acme (${String(config.baseUrl)})` });
        await post({ action: "create", provider: "acme-voice", accountName: "work", config: { baseUrl: "https://acme.invalid/v1?x=1" }, secrets: { apiKey: KEY } });
        expect((await json(get())).routes[0].destination).toEqual({ kind: "cloud", label: "Acme (acme.invalid)" });
        definition.destinationFor = () => { throw new Error(MARKER); };
        const body = await json(get());
        expect(body.routes[0].destination).toEqual({ kind: "cloud", label: "Acme (acme.invalid)" });
        noSecrets(body);
    });

    test("a body without Content-Length is cut off at 64 KiB while streaming", async () => {
        const { ctx } = await setup();
        let pulled = 0;
        const chunk = new Uint8Array(16 * 1024).fill(32);
        const body = new ReadableStream<Uint8Array>({ pull(controller) { pulled++; controller.enqueue(chunk); } });
        const req = new Request("http://local/voice/api", { method: "POST", body, headers: { "content-type": "application/json", "x-csrf-token": "good" }, duplex: "half" } as RequestInit);
        expect(req.headers.get("content-length")).toBeNull();
        const response = await api(ctx, owner, { req });
        expect(response.status).toBe(413);
        // An endless stream: the handler stopped after the first chunk past the limit instead of buffering it all.
        expect(pulled).toBeLessThanOrEqual(8);
    });
});
