import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

// Routing task 1.3: grammar, resolution against current registrations, the persisted `voice.defaultRoute`
// setting, the per-chat scratchpad override under the single flat key `voice.route`, inheritance, reset and
// explicit unavailability WITHOUT any fallback. Providers and connections here are fixtures: a route failure is
// reported, never retried against another route, and no real service is contacted.
const KEY = "fixture-secret-value-0123456789";
// Marker embedded into rejected route strings: no error may ever echo it back.
const MARKER = "token=leaky-secret-marker";

function definition(id: string, extra: Partial<types.voice.ProviderDefinition> = {}): types.voice.ProviderDefinition {
    return {
        id,
        label: `${id} fixture`,
        destination: { kind: "cloud", label: `${id} (voice.invalid)` },
        fields: [
            { key: "apiKey", label: "API key", type: "secret", required: true },
            { key: "baseUrl", label: "Base URL", type: "url", default: `https://${id}.invalid/v1` },
        ],
        models: [
            { id: `${id}-live`, label: "Live", capabilities: { turnDetection: "client", sampleRates: [24000, 16000] } },
            // Native ids may carry slashes and colons; the route grammar must round-trip them.
            { id: "nested/model:v2", capabilities: { turnDetection: "server", sampleRates: [16000] } },
        ],
        test: async () => ({ status: "available", reason: "voice-ok", message: "Fixture ready", checkedAt: 1 }),
        open: async () => ({ append: async () => {}, commit: async () => {}, finish: async () => {}, cancel: async () => {} }),
        ...extra,
    };
}

async function setup() {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 21).toString("base64") } });
    // Determinism: every case starts with no default-route override stored earlier in this worker's database.
    await ctx.fns.settings.remove({ module: "voice", scopeType: "global", key: "defaultRoute" });
    let discovered = 0;
    ctx.state.voice ??= {};
    ctx.state.voice.providers = {
        "acme-voice": { owner: "core", module: "voice", rel: "voice/$voiceProvider_acme-voice.ts", abs: "/app/src/voice/$voiceProvider_acme-voice.ts", definition: definition("acme-voice") },
        "beta-voice": {
            owner: "core", module: "voice", rel: "voice/$voiceProvider_beta-voice.ts", abs: "/app/src/voice/$voiceProvider_beta-voice.ts",
            // Discovery-only provider: the contract `listModels` supplies the catalogue for route checks.
            definition: definition("beta-voice", { models: undefined, listModels: async () => { discovered++; return [{ id: "beta-live", capabilities: { turnDetection: "client", sampleRates: [48000] } }]; } }),
        },
    };
    await ctx.fns.voice.create({ provider: "acme-voice", accountName: "work", secrets: { apiKey: KEY } });
    await ctx.fns.voice.create({ provider: "acme-voice", accountName: "home office", secrets: { apiKey: KEY } });
    await ctx.fns.voice.create({ provider: "beta-voice", accountName: "prod", secrets: { apiKey: KEY } });
    return { ctx, discoveredCount: () => discovered };
}

const setDefault = (ctx: any, value: string) => ctx.fns.settings.set({ module: "voice", scopeType: "global", key: "defaultRoute", value });

// The first test context builds the migrated template database; keep that out of per-test timeouts.
beforeAll(async () => { await mkTestCtx(); }, 60000);

describe("voice route grammar", () => {
    test("parses provider, account and native model, preserving separators and spaces", async () => {
        const { ctx } = await setup();
        expect(ctx.fns.voice.route.parseRoute({ route: "acme-voice/work:acme-voice-live" }))
            .toEqual({ provider: "acme-voice", accountName: "work", modelId: "acme-voice-live" });
        expect(ctx.fns.voice.route.parseRoute({ route: "acme-voice/home office:nested/model:v2" }))
            .toEqual({ provider: "acme-voice", accountName: "home office", modelId: "nested/model:v2" });
    });

    test("rejects malformed and legacy-shaped routes explicitly", async () => {
        const { ctx } = await setup();
        for (const route of ["", "acme-voice", "acme-voice/work", "acme-voice/work:", "/work:model", "acme-voice/:model", "acme:voice/work:model", "acme-voice/wo/rk:model"]) {
            expect(() => ctx.fns.voice.route.parseRoute({ route: route as never })).toThrow();
        }
        const probeParse = (route: string): (Error & { code: string; reason: string }) | null => {
            try { ctx.fns.voice.route.parseRoute({ route }); return null; }
            catch (e) { return e as Error & { code: string; reason: string }; }
        };
        const error = probeParse("vendor:model")!;
        expect(error.code).toBe("routeUnavailable");
        expect(error.reason).toBe("invalid-route");
        // Fixed failure text: a rejected route string may embed a credential-bearing URL and is never echoed back.
        expect(error.message).not.toContain("vendor:model");
        expect(probeParse(`vendor:x?${MARKER}`)!.message).not.toContain(MARKER);
    });

    test("enforces the SDK field rules: kebab-case provider ids and CRUD field lengths", async () => {
        const { ctx } = await setup();
        // Provider ids follow the declaration loader: lowercase kebab-case only.
        for (const route of ["Acme-Voice/work:m", "ACME/work:m", "acme voice/work:m", "acme_voice/work:m", "-acme/work:m", "acme-/work:m", "1acme/work:m", "acme.:work:m"]) {
            expect(() => ctx.fns.voice.route.parseRoute({ route })).toThrow();
        }
        expect(ctx.fns.voice.route.parseRoute({ route: "a1-b2/work:m" })).toMatchObject({ provider: "a1-b2" });
        // Account names follow connection CRUD: 1–100 characters after trim, internal spaces kept.
        expect(ctx.fns.voice.route.parseRoute({ route: `acme-voice/${"a".repeat(100)}:m` })).toBeTruthy();
        expect(() => ctx.fns.voice.route.parseRoute({ route: `acme-voice/${"a".repeat(101)}:m` })).toThrow();
        for (const account of ["   ", " work", "work ", `work${" ".repeat(101)}`]) {
            expect(() => ctx.fns.voice.route.parseRoute({ route: `acme-voice/${account}:m` })).toThrow();
        }
        // Native model ids keep separators but stay within the 200-character declaration limit.
        expect(ctx.fns.voice.route.parseRoute({ route: `acme-voice/work:${"m".repeat(200)}` })).toBeTruthy();
        expect(() => ctx.fns.voice.route.parseRoute({ route: `acme-voice/work:${"m".repeat(201)}` })).toThrow();
    });

    test("formats components only when they round-trip through the parser", async () => {
        const { ctx } = await setup();
        expect(ctx.fns.voice.route.formatRoute({ provider: "acme-voice", accountName: "home office", modelId: "nested/model:v2" }))
            .toBe("acme-voice/home office:nested/model:v2");
        expect(() => ctx.fns.voice.route.formatRoute({ provider: "acme-voice", accountName: "bad/name", modelId: "m" })).toThrow();
        expect(() => ctx.fns.voice.route.formatRoute({ provider: "bad:name", accountName: "a", modelId: "m" })).toThrow();
        // Formatting failures also carry fixed text without the offending components.
        const formatError = await Promise.resolve().then(() => ctx.fns.voice.route.formatRoute({ provider: `bad?${MARKER}`, accountName: "a", modelId: "m" })).then(() => null, (e: any) => e);
        expect(formatError).toMatchObject({ reason: "invalid-route" });
        expect(String(formatError!.message)).not.toContain(MARKER);
    });
});

describe("voice route resolution", () => {
    test("resolves a valid route to the exact connection, destination, model and negotiated sample rate", async () => {
        const { ctx } = await setup();
        const resolved = await ctx.fns.voice.resolveRoute({ route: "acme-voice/work:acme-voice-live" });
        expect(resolved).toMatchObject({
            route: "acme-voice/work:acme-voice-live",
            provider: "acme-voice",
            accountName: "work",
            modelId: "acme-voice-live",
            destination: { kind: "cloud", label: "acme-voice (voice.invalid)" },
            sampleRate: 24000,
        });
        expect(resolved.model.id).toBe("acme-voice-live");
        expect(resolved.connectionId).toMatch(/^[0-9a-f-]{36}$/);
        // The public result never carries secret material.
        expect(JSON.stringify(resolved)).not.toContain(KEY);
    });

    test("checks the catalogue by contract: declared models first, then provider discovery", async () => {
        const { ctx, discoveredCount } = await setup();
        expect(await ctx.fns.voice.resolveRoute({ route: "acme-voice/home office:nested/model:v2" })).toMatchObject({ sampleRate: 16000 });
        expect(discoveredCount()).toBe(0);
        expect(await ctx.fns.voice.resolveRoute({ route: "beta-voice/prod:beta-live" })).toMatchObject({ sampleRate: 48000 });
        expect(discoveredCount()).toBe(1);
    });

    test("validates discovered models against the SDK contract and returns only known fields", async () => {
        const { ctx } = await setup();
        ctx.state.voice!.providers!["beta-voice"]!.definition.listModels = async () => ([
            { id: "beta-good", label: "Good", description: "ok", internal: "provider-payload", capabilities: { turnDetection: "client", sampleRates: [48000, 24000], languages: true, hidden: "extra-capability" } },
            { id: "beta-zero", capabilities: { turnDetection: "client", sampleRates: [0] } },
            { id: "beta-negative", capabilities: { turnDetection: "client", sampleRates: [-16000] } },
            { id: "beta-fraction", capabilities: { turnDetection: "client", sampleRates: [24000.5] } },
            { id: "beta-string", capabilities: { turnDetection: "client", sampleRates: ["24000"] } },
            { id: "beta-duplicate-rate", capabilities: { turnDetection: "client", sampleRates: [16000, 16000] } },
            { id: "beta-td", capabilities: { turnDetection: "auto", sampleRates: [16000] } },
            { id: "beta-flag", capabilities: { turnDetection: "client", sampleRates: [16000], keywords: "yes" } },
            { id: "beta-nocaps" },
            { get id(): string { throw new Error("getter-marker"); } },
        ] as unknown as types.voice.VoiceModel[]);
        const resolved = await ctx.fns.voice.resolveRoute({ route: "beta-voice/prod:beta-good" });
        expect(resolved.sampleRate).toBe(48000);
        // Public projection only: destination and model expose exactly the known SDK fields.
        expect(Object.keys(resolved.destination).sort()).toEqual(["kind", "label"]);
        expect(Object.keys(resolved.model).sort()).toEqual(["capabilities", "description", "id", "label"]);
        expect(Object.keys(resolved.model.capabilities).sort()).toEqual(["languages", "sampleRates", "turnDetection"]);
        expect(resolved.model.capabilities.languages).toBe(true);
        const dumped = JSON.stringify(resolved);
        expect(dumped).not.toContain("provider-payload");
        expect(dumped).not.toContain("hidden");
        expect(dumped).not.toContain("extra-capability");
        expect(dumped).not.toContain("getter-marker");
        // Every invalid entry is simply not offered: the route reports unknown-model with a fixed reason.
        const probe = (route: string) => ctx.fns.voice.resolveRoute({ route }).then(() => null, (e: any) => e);
        for (const modelId of ["beta-zero", "beta-negative", "beta-fraction", "beta-string", "beta-duplicate-rate", "beta-td", "beta-flag", "beta-nocaps"]) {
            expect(await probe(`beta-voice/prod:${modelId}`)).toMatchObject({ code: "routeUnavailable", reason: "unknown-model" });
        }
        // The throwing getter contributes no usable id and never escapes the fixed errors.
        const unknown = await probe("beta-voice/prod:not-in-catalogue");
        expect(unknown).toMatchObject({ code: "routeUnavailable", reason: "unknown-model" });
        expect(String(unknown!.message)).not.toContain("getter-marker");
    });

    test("a discovery duplicate never overrides a declared model, and hostile discovery cannot escape the fixed errors", async () => {
        const { ctx } = await setup();
        ctx.state.voice!.providers!["delta-voice"] = { owner: "core", module: "voice", rel: "voice/$voiceProvider_delta-voice.ts", abs: "/app/src/voice/$voiceProvider_delta-voice.ts", definition: definition("delta-voice", { listModels: async () => [
            { id: "delta-voice-live", label: "Impostor", capabilities: { turnDetection: "server", sampleRates: [8000] } },
            { id: "delta-extra", capabilities: { turnDetection: "client", sampleRates: [12000] } },
        ] }) };
        await ctx.fns.voice.create({ provider: "delta-voice", accountName: "main", secrets: { apiKey: KEY } });
        const discovered = await ctx.fns.voice.resolveRoute({ route: "delta-voice/main:delta-extra" });
        expect(discovered.sampleRate).toBe(12000);
        // The declared model keeps its declared shape; the discovery duplicate is dropped.
        const declared = await ctx.fns.voice.resolveRoute({ route: "delta-voice/main:delta-voice-live" });
        expect(declared.model.label).toBe("Live");
        expect(declared.sampleRate).toBe(24000);

        // A discovery element whose access throws is a fixed catalogue failure, not an uncaught crash.
        ctx.state.voice!.providers!["sigma-voice"] = { owner: "core", module: "voice", rel: "voice/$voiceProvider_sigma-voice.ts", abs: "/app/src/voice/$voiceProvider_sigma-voice.ts", definition: definition("sigma-voice", { models: undefined, listModels: async () => {
            const list: unknown[] = [];
            Object.defineProperty(list, "length", { get: () => 1, configurable: true });
            Object.defineProperty(list, 0, { get: () => { throw new Error("sigma-iteration-marker"); }, configurable: true });
            return list as types.voice.VoiceModel[];
        } }) };
        await ctx.fns.voice.create({ provider: "sigma-voice", accountName: "s", secrets: { apiKey: KEY } });
        const failed = await ctx.fns.voice.resolveRoute({ route: "sigma-voice/s:sigma-voice-live" }).then(() => null, (e: any) => e);
        expect(failed).toMatchObject({ code: "routeUnavailable", reason: "catalogue-failed" });
        expect(String(failed!.message)).not.toContain("sigma-iteration-marker");
        // A non-list discovery result is the same fixed failure.
        ctx.state.voice!.providers!["sigma-voice"]!.definition.listModels = (async () => ({ id: "x" })) as never;
        expect(await ctx.fns.voice.resolveRoute({ route: "sigma-voice/s:sigma-voice-live" }).then(() => null, (e: any) => e)).toMatchObject({ code: "routeUnavailable", reason: "catalogue-failed" });
    });


    test("reports an unavailable route with code routeUnavailable and a closed reason — never a substitute", async () => {
        const { ctx } = await setup();
        const probe = async (route: string) => {
            try { await ctx.fns.voice.resolveRoute({ route }); return null; }
            catch (e) { return e as Error & { code: string; reason: string }; }
        };
        expect(await probe("")).toMatchObject({ code: "unconfigured", reason: "not-selected" });
        expect(await probe("nope-voice/prod:beta-live")).toMatchObject({ code: "routeUnavailable", reason: "unknown-provider" });
        expect(await probe("acme-voice/ghost:acme-voice-live")).toMatchObject({ code: "routeUnavailable", reason: "unknown-connection" });
        expect(await probe("acme-voice/work:missing-model")).toMatchObject({ code: "routeUnavailable", reason: "unknown-model" });
        expect(await probe("beta-voice/prod:gone")).toMatchObject({ code: "routeUnavailable", reason: "unknown-model" });
    });

    test("a renamed connection invalidates its old route; discovery failure is catalogue-failed without provider text", async () => {
        const { ctx } = await setup();
        const connection = (await ctx.fns.voice.list({ provider: "acme-voice" }))[0];
        await ctx.fns.voice.update({ id: connection.id, accountName: "renamed" });
        const error = await ctx.fns.voice.resolveRoute({ route: "acme-voice/work:acme-voice-live" }).then(() => null, (e: any) => e);
        expect(error).toMatchObject({ code: "routeUnavailable", reason: "unknown-connection" });

        const broken: types.voice.ProviderDefinition = { ...definition("gamma-voice"), models: undefined, listModels: async () => { throw new Error(`401 for key ${KEY}`); } };
        ctx.state.voice!.providers!["gamma-voice"] = { owner: "core", module: "voice", rel: "voice/$voiceProvider_gamma-voice.ts", abs: "/app/src/voice/$voiceProvider_gamma-voice.ts", definition: broken };
        await ctx.fns.voice.create({ provider: "gamma-voice", accountName: "g", secrets: { apiKey: KEY } });
        const failed = await ctx.fns.voice.resolveRoute({ route: "gamma-voice/g:whatever" }).then(() => null, (e: any) => e);
        expect(failed).toMatchObject({ code: "routeUnavailable", reason: "catalogue-failed" });
        expect(failed.message).not.toContain(KEY);
    });
});

describe("voice default route setting", () => {
    test("rejects malformed routes at settings.set and keeps a valid one for the next call", async () => {
        const { ctx } = await setup();
        await expect(setDefault(ctx, "vendor:model")).rejects.toMatchObject({ code: "INVALID_SETTING" });
        await expect(setDefault(ctx, "acme-voice/")).rejects.toMatchObject({ code: "INVALID_SETTING" });
        // Fixed text: the rejected value could embed a credential-bearing URL and is never echoed back.
        const settingsError = await setDefault(ctx, `vendor:model?${MARKER}`).then(() => null, (e: any) => e);
        expect(settingsError).toMatchObject({ code: "INVALID_SETTING" });
        expect(String(settingsError!.message)).not.toContain(MARKER);

        await setDefault(ctx, "acme-voice/work:acme-voice-live");
        expect(await ctx.fns.settings.get({ module: "voice", scopeType: "global", key: "defaultRoute" })).toBe("acme-voice/work:acme-voice-live");
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        expect(await ctx.fns.voice.effectiveRoute({ agentId: agent.id })).toEqual({ route: "acme-voice/work:acme-voice-live", source: "default" });
        // A preference change applies to the very next call, without any cache.
        await setDefault(ctx, "acme-voice/home office:nested/model:v2");
        expect(await ctx.fns.voice.effectiveRoute({ agentId: agent.id })).toEqual({ route: "acme-voice/home office:nested/model:v2", source: "default" });
    });

    test("an empty default means unconfigured — explicitly, with no fallback to any connection", async () => {
        const { ctx } = await setup();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        expect(await ctx.fns.voice.effectiveRoute({ agentId: agent.id })).toEqual({ route: "", source: "none" });
        const error = await ctx.fns.voice.resolveRoute({ route: "" }).then(() => null, (e: any) => e);
        expect(error).toMatchObject({ code: "unconfigured", reason: "not-selected" });
    });
});

describe("voice per-chat route override", () => {
    test("override wins per chat, persists in storage and survives reopening; other chats keep the default", async () => {
        const { ctx } = await setup();
        await setDefault(ctx, "acme-voice/work:acme-voice-live");
        const chat = await ctx.fns.agent.start({ model: "mock:test" });
        const other = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.voice.route.setOverride({ agentId: chat.id, route: "beta-voice/prod:beta-live" });
        expect(await ctx.fns.voice.effectiveRoute({ agentId: chat.id })).toEqual({ route: "beta-voice/prod:beta-live", source: "override" });
        expect(await ctx.fns.voice.effectiveRoute({ agentId: other.id })).toEqual({ route: "acme-voice/work:acme-voice-live", source: "default" });
        // Persistence: the exact flat key lives in the stored agent scratchpad.
        const row = (await ctx.fns.procs.db.select({ sql: "SELECT scratchpad FROM agents WHERE id=?", params: [chat.id] }) as any[])[0];
        expect(JSON.parse(row.scratchpad)["voice.route"]).toBe("beta-voice/prod:beta-live");
        // Reopen simulation: drop the live agent so effectiveRoute must reload from storage.
        delete ctx.state.agent[chat.id];
        expect(await ctx.fns.voice.effectiveRoute({ agentId: chat.id })).toEqual({ route: "beta-voice/prod:beta-live", source: "override" });
    });

    test("clearing the override restores inheritance and is idempotent", async () => {
        const { ctx } = await setup();
        await setDefault(ctx, "acme-voice/work:acme-voice-live");
        const chat = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.voice.route.setOverride({ agentId: chat.id, route: "acme-voice/home office:acme-voice-live" });
        const cleared = await ctx.fns.voice.route.clearOverride({ agentId: chat.id });
        expect(cleared).toEqual({ ok: true, cleared: true });
        expect(await ctx.fns.voice.effectiveRoute({ agentId: chat.id })).toEqual({ route: "acme-voice/work:acme-voice-live", source: "default" });
        expect(await ctx.fns.voice.route.clearOverride({ agentId: chat.id })).toEqual({ ok: true, cleared: false });
        const row = (await ctx.fns.procs.db.select({ sql: "SELECT scratchpad FROM agents WHERE id=?", params: [chat.id] }) as any[])[0];
        expect(Object.hasOwn(JSON.parse(row.scratchpad), "voice.route")).toBe(false);
    });

    test("setOverride and clearOverride touch only the voice.route key and keep unrelated live-only scratchpad state", async () => {
        const { ctx } = await setup();
        const chat = await ctx.fns.agent.start({ model: "mock:test" });
        const live = ctx.state.agent[chat.id] as { scratchpad?: Record<string, any> };
        if (!live.scratchpad || typeof live.scratchpad !== "object") live.scratchpad = {};
        live.scratchpad["draft.unsaved"] = { text: "keep me" };
        const identity = live.scratchpad;
        await ctx.fns.voice.route.setOverride({ agentId: chat.id, route: "beta-voice/prod:beta-live" });
        // Same object, same unrelated data — the persisted snapshot is never assigned over the live state.
        expect((ctx.state.agent[chat.id] as any).scratchpad).toBe(identity);
        expect(identity["draft.unsaved"]).toEqual({ text: "keep me" });
        expect(identity["voice.route"]).toBe("beta-voice/prod:beta-live");
        await ctx.fns.voice.route.clearOverride({ agentId: chat.id });
        expect((ctx.state.agent[chat.id] as any).scratchpad).toBe(identity);
        expect(identity["draft.unsaved"]).toEqual({ text: "keep me" });
        expect(Object.hasOwn(identity, "voice.route")).toBe(false);
    });


    test("setOverride stores only syntactically valid routes but never checks availability, so a broken route stays selected", async () => {
        const { ctx } = await setup();
        await setDefault(ctx, "acme-voice/work:acme-voice-live");
        const chat = await ctx.fns.agent.start({ model: "mock:test" });
        await expect(ctx.fns.voice.route.setOverride({ agentId: chat.id, route: "bad route" })).rejects.toMatchObject({ code: "routeUnavailable", reason: "invalid-route" });
        await ctx.fns.voice.route.setOverride({ agentId: chat.id, route: "acme-voice/gone:whatever" });
        // No fallback: the selected-but-broken override is what effectiveRoute reports…
        expect(await ctx.fns.voice.effectiveRoute({ agentId: chat.id })).toEqual({ route: "acme-voice/gone:whatever", source: "override" });
        // …and resolveRoute ends with explicit unavailability instead of the working default.
        const error = await ctx.fns.voice.resolveRoute({ route: (await ctx.fns.voice.effectiveRoute({ agentId: chat.id })).route }).then(() => null, (e: any) => e);
        expect(error).toMatchObject({ code: "routeUnavailable", reason: "unknown-connection" });
    });
});
