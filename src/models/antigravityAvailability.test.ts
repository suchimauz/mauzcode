import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import api from "./api";
import { text, world } from "./fixtures/antigravityWorld.entry";

beforeAll(async () => { await mkTestCtx(); }, 60000);

const NEON = ["gemini-4-neon-high", "gemini-4-neon-xhigh", "gemini-4-neon-medium", "gemini-4-neon-low"];
const FLASH = ["gemini-3.8-flash-high", "gemini-3.8-flash-medium", "gemini-3.8-flash-low"];
const OPUS = ["claude-opus-5-5-low", "claude-opus-5-5-medium", "claude-opus-5-5-high"];

async function setup(name: string, refresh = true) {
    const w = await world({ stream: () => text("ok") });
    const c = await w.connect(name, undefined, refresh);
    const stored = async () => ((await w.ctx.fns.procs.db.select({ sql: "SELECT disabled_models, updated_at FROM llm_connections WHERE id=?", params: [c.id] }))[0] as { disabled_models: string[]; updated_at: string });
    const legacy = (ids: string[], id = c.id) => w.ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET disabled_models=?::text[] WHERE id=?", params: [ids, id] });
    const levels = async (id = c.id) => Object.fromEntries((await w.ctx.fns.models.listModels({ id, cacheOnly: true })).models.map((m: types.models.ModelInfo) => [m.id, m.disabled ? "off" : (m.reasoning?.supported ?? []).join(",")]));
    return { w, c, stored, legacy, levels };
}

describe("legacy member disable conversion (3.1)", () => {
    test("explicit, partial and full legacy disables convert to group flags; repeat is a no-op; observed availability is unchanged", async () => {
        const { w, c, stored, legacy, levels } = await setup("convert");
        // Explicit group disable, partial Flash disable, full Opus disable, a standalone and an unknown id.
        await legacy(["gemini-4-neon", "gemini-4-neon-low", "gemini-3.8-flash-low", ...OPUS, "gemini-3-flash", "gemini-old-unknown"]);
        const before = await levels();
        expect(before["gemini-4-neon"]).toBe("off");
        expect(before["gemini-3.8-flash"]).toBe("high,medium,low");
        expect(before["claude-opus-5-5"]).toBe("off");
        expect(before["gemini-3-flash"]).toBe("off");
        const n = w.calls.length;
        expect(await w.ctx.fns.models.catalog.convertLegacyDisables({ id: c.id })).toEqual({ converted: [c.id], failed: [] });
        expect((await stored()).disabled_models.sort()).toEqual(["claude-opus-5-5", "gemini-3-flash", "gemini-4-neon", "gemini-old-unknown"]);
        expect(await levels()).toEqual(before);
        const at = (await stored()).updated_at;
        expect(await w.ctx.fns.models.catalog.convertLegacyDisables({ id: c.id })).toEqual({ converted: [], failed: [] });
        expect((await stored()).updated_at).toBe(at);
        // Conversion is cache-only: no provider request.
        expect(w.calls.length).toBe(n);
        // Enabling either off group restores all its eligible levels; the standalone keeps its own state.
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "claude-opus-5-5", enabled: true });
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-4-neon", enabled: true });
        expect(await levels()).toMatchObject({ "gemini-4-neon": "high,xhigh,medium,low", "claude-opus-5-5": "low,medium,high", "gemini-3-flash": "off" });
    });

    test("a successful refresh converts; a cache-only read never writes; a cold cache defers until a valid refresh", async () => {
        const { w, c, stored, legacy } = await setup("cold", false);
        await legacy(["gemini-4-neon-low", ...OPUS]);
        const at = (await stored()).updated_at;
        // Cold cache: nothing is inferred from names, nothing is written, no discovery.
        expect(await w.ctx.fns.models.listModels({ id: c.id, cacheOnly: true })).toMatchObject({ models: [], source: "manual" });
        expect(await w.ctx.fns.models.catalog.convertLegacyDisables({ id: c.id })).toEqual({ converted: [], failed: [] });
        expect(await stored()).toEqual({ disabled_models: ["gemini-4-neon-low", ...OPUS], updated_at: at });
        expect(w.lists().length).toBe(0);
        // The next successful refresh publishes the mapping and converts in the same flow.
        await w.ctx.fns.models.listModels({ id: c.id, refresh: true });
        expect((await stored()).disabled_models).toEqual(["claude-opus-5-5"]);
        // Later cache-only reads do not touch the row.
        const after = await stored();
        await w.ctx.fns.models.listModels({ id: c.id, cacheOnly: true });
        await w.ctx.fns.tools.listModels({ provider: "antigravity" });
        expect(await stored()).toEqual(after);
    });

    test("an ambiguous group is not converted and its native ids keep their stored flags", async () => {
        const { w, c, stored, legacy } = await setup("ambiguous");
        // Overwrite the cache with a group whose member collides with another group's member: no levels, no mapping.
        await w.ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET models_cache=?::jsonb WHERE id=?", params: [JSON.stringify([
            { id: "g1", reasoning: { supported: ["low"], variants: { members: [{ level: "low", id: "shared-low" }] } } },
            { id: "g2", reasoning: { supported: ["low"], variants: { members: [{ level: "low", id: "shared-low" }] } } },
        ]), c.id] });
        await legacy(["shared-low"]);
        expect(await w.ctx.fns.models.catalog.convertLegacyDisables({ id: c.id })).toEqual({ converted: [], failed: [] });
        expect((await stored()).disabled_models).toEqual(["shared-low"]);
    });

    test("conversion is connection-local and leaves another provider's member disables alone", async () => {
        const { w, c, stored, legacy } = await setup("first");
        const other = await w.connect("second", "ya29.SECRET-other");
        // A variant provider without group-level availability keeps per-member behaviour.
        w.ctx.state.models!.providers!.acme = { owner: "core", module: "models", rel: "models/$modelProvider_acme.ts", definition: {
            id: "acme", label: "Acme", fields: [], transports: ["direct"], capabilities: { reasoning: true },
            test: async () => ({ status: "available", reason: "ok", message: "ok", checkedAt: Date.now() }),
            listModels: async () => [{ id: "grp", reasoning: { supported: ["low", "high"], variants: { members: [{ level: "low", id: "grp-low" }, { level: "high", id: "grp-high" }] } } }],
            stream: async () => ({ text: "", thinking: "", finishReason: "stop", usage: { prompt_tokens: 0, completion_tokens: 0 } }) as any,
        } as types.models.ProviderDefinition };
        const acme = await w.ctx.fns.models.create({ provider: "acme", accountName: "acme-one", config: {}, secrets: {}, transport: { kind: "direct" } });
        await w.ctx.fns.models.listModels({ id: acme.id, refresh: true });
        await w.ctx.fns.models.setModelEnabled({ id: acme.id, model: "grp-low", enabled: false });
        expect((await w.ctx.fns.models.listModels({ id: acme.id, cacheOnly: true })).models[0]!.reasoning!.supported).toEqual(["high"]);
        await legacy(["gemini-4-neon-low"]);
        await legacy(["gemini-4-neon-low", "gemini-3-flash"], other.id);
        expect(await w.ctx.fns.models.catalog.convertLegacyDisables({ id: c.id })).toEqual({ converted: [c.id], failed: [] });
        expect((await stored()).disabled_models).toEqual([]);
        expect((await w.ctx.fns.models.get({ id: other.id })).disabledModels).toEqual(["gemini-3-flash", "gemini-4-neon-low"]);
        expect((await w.ctx.fns.models.get({ id: acme.id })).disabledModels).toEqual(["grp-low"]);
        // The startup pass converts every group-level connection and still skips the other provider.
        expect((await w.ctx.fns.models.catalog.convertLegacyDisables({})).converted).toEqual([other.id]);
        expect((await w.ctx.fns.models.get({ id: other.id })).disabledModels).toEqual(["gemini-3-flash"]);
        expect((await w.ctx.fns.models.get({ id: acme.id })).disabledModels).toEqual(["grp-low"]);
    });

    test("concurrent conversion and availability edits never lose either write", async () => {
        const { w, c, stored, legacy } = await setup("race");
        for (let i = 0; i < 5; i++) {
            await legacy(["gemini-4-neon-low", "gemini-3.8-flash-high"]);
            await Promise.all([
                w.ctx.fns.models.catalog.convertLegacyDisables({ id: c.id }),
                w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-3-flash", enabled: false }),
                w.ctx.fns.models.setModelEnabled({ id: c.id, model: "claude-opus-5-5", enabled: false }),
            ]);
            await w.ctx.fns.models.catalog.convertLegacyDisables({ id: c.id });
            expect((await stored()).disabled_models.sort()).toEqual(["claude-opus-5-5", "gemini-3-flash"]);
        }
    });
});

describe("group-level availability edits (3.2)", () => {
    test("member edits are refused with the group id and no write, through the runtime call and /models/api", async () => {
        const { w, c, stored, legacy } = await setup("refuse");
        await legacy(["gemini-4-neon-low"]);
        const before = await stored();
        for (const enabled of [false, true]) for (const model of ["gemini-4-neon-high", "gemini-4-neon-low", "claude-opus-5-5-low"]) {
            const err = await w.ctx.fns.models.setModelEnabled({ id: c.id, model, enabled }).then(() => null, (e: any) => e);
            expect(err).toMatchObject({ code: "VALIDATION", field: "model", status: 400, group: model.startsWith("gemini") ? "gemini-4-neon" : "claude-opus-5-5" });
            expect(err.message).toContain(model.startsWith("gemini") ? "gemini-4-neon" : "claude-opus-5-5");
        }
        expect(await stored()).toEqual(before);
        w.ctx.state.registry.auth.verifyCsrf = async (_c: unknown, _s: unknown, o: { token: string }) => o.token === "good";
        const owner = { user: { id: "u1", role: "owner" } } as unknown as Session;
        const post = (body: unknown) => api(w.ctx, owner, { req: new Request("http://local/models/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-csrf-token": "good" } }) });
        const res = await post({ action: "setModelEnabled", id: c.id, model: "gemini-3.8-flash-high", enabled: false });
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: "VALIDATION", field: "model", error: expect.stringContaining("gemini-3.8-flash") });
        expect(await stored()).toEqual(before);
        // The group id and a standalone model still toggle, through both paths.
        expect((await post({ action: "setModelEnabled", id: c.id, model: "gemini-3.8-flash", enabled: false })).status).toBe(200);
        expect((await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-3-flash", enabled: false })).disabledModels).toEqual(["gemini-3-flash", "gemini-3.8-flash", "gemini-4-neon-low"]);
        expect((await post({ action: "setModelEnabled", id: c.id, model: "gemini-3-flash", enabled: true })).status).toBe(200);
        // Disabling a group stores only the group id.
        expect((await w.ctx.fns.models.get({ id: c.id })).disabledModels).toEqual(["gemini-3.8-flash", "gemini-4-neon-low"]);
    });

    test("enabling a fully member-disabled group before conversion restores every level and a later conversion keeps it on", async () => {
        const { w, c, stored, legacy, levels } = await setup("restore");
        await legacy([...NEON, "gemini-3-flash", "gemini-old-unknown"]);
        expect((await levels())["gemini-4-neon"]).toBe("off");
        await expect(w.ctx.fns.models.stream({ connectionId: c.id, model: "gemini-4-neon", instructions: "", sessionId: "s", messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-4-neon", enabled: true });
        expect((await stored()).disabled_models).toEqual(["gemini-3-flash", "gemini-old-unknown"]);
        const route = c.route("gemini-4-neon");
        const picker = (await w.ctx.fns.frontendBridge.modelCatalogue({})).models.find((m: any) => m.model === route);
        expect(picker).toMatchObject({ disabled: false, reasoning: { supported: ["high", "xhigh", "medium", "low"] } });
        expect((await w.ctx.fns.tools.listModels({ provider: "antigravity" })).models.find((m: any) => m.route === route)!.reasoning).toEqual(["high", "xhigh", "medium", "low"]);
        await w.ctx.fns.models.stream({ connectionId: c.id, model: "gemini-4-neon", reasoningEffort: "low", instructions: "", sessionId: "s", messages: [{ role: "user", content: "hi" }] });
        expect(w.gens().at(-1)!.body.model).toBe("gemini-4-neon-low");
        await w.ctx.fns.models.catalog.convertLegacyDisables({ id: c.id });
        expect((await levels())["gemini-4-neon"]).toBe("high,xhigh,medium,low");
        expect((await stored()).disabled_models).toEqual(["gemini-3-flash", "gemini-old-unknown"]);
    });

    test("an unmapped group id changes only itself", async () => {
        const { w, c, stored, legacy } = await setup("unmapped", false);
        // Cold cache: no trustworthy mapping, so enabling the group id cannot prove which member flags belong to it.
        await legacy(["gemini-4-neon", ...NEON, ...FLASH]);
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-4-neon", enabled: true });
        expect((await stored()).disabled_models.sort()).toEqual([...NEON, ...FLASH].sort());
        await w.ctx.fns.models.setModelEnabled({ id: c.id, model: "gemini-4-neon-low", enabled: true });
        expect((await stored()).disabled_models).not.toContain("gemini-4-neon-low");
    });
});
