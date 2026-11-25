import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import { ACCESS, INVENTORY, LIST, STREAM, inventory, world } from "./fixtures/antigravityWorld.entry";

beforeAll(async () => { await mkTestCtx(); }, 60000);

const map = async (response: Record<string, unknown>) => (await mkTestCtx()).fns.models.provider.antigravity.mapModels({ response });
const G = "MODEL_PROVIDER_GOOGLE";
const levelsOf = (models: types.models.ModelInfo[], id: string) => models.find(m => m.id === id)?.reasoning?.supported;
const membersOf = (models: types.models.ModelInfo[], id: string) => models.find(m => m.id === id)?.reasoning?.variants?.members.map(m => m.id);

describe("account inventory (1.1, 1.2)", () => {
    test("both families, groups and a standalone model are offered once; GPT-OSS and service ids are not; a test never generates", async () => {
        const w = await world();
        const c = await w.connect("inv", ACCESS, false);
        expect(await w.ctx.fns.models.test({ id: c.id })).toMatchObject({ status: "available", reason: "models-ok" });
        const { models } = await w.ctx.fns.models.listModels({ id: c.id, refresh: true });
        expect(models.map((m: any) => [m.id, m.family])).toEqual([["gemini-4-neon", "gemini"], ["gemini-3.8-flash", "gemini"], ["gemini-3-flash", "gemini"], ["claude-opus-5-5", "claude"], ["gemini-3-pro-high", "gemini"], ["gemini-2.5-flash-lite", "gemini"]]);
        const text = JSON.stringify(models);
        for (const hidden of ["gpt-oss", "tab_flash_lite_preview", "gemini-claude-unattributed", "gemini-3-flash-disabled", "gemini-not-in-models"]) expect(text).not.toContain(hidden);
        expect(text).not.toMatch(/price|quotaInfo|remainingFraction|modelProvider/);
        expect(w.calls.some(x => x.url === STREAM)).toBe(false);
        expect(w.lists().length).toBe(2);
    });

    test("levels come only from groupedModels joined to visible native members, in provider order", async () => {
        const models = await map(INVENTORY);
        // Neon keeps xhigh; Flash has no minimal even though an older Flash profile offered it.
        expect(levelsOf(models, "gemini-4-neon")).toEqual(["high", "xhigh", "medium", "low"]);
        expect(membersOf(models, "gemini-4-neon")).toEqual(["gemini-4-neon-high", "gemini-4-neon-xhigh", "gemini-4-neon-medium", "gemini-4-neon-low"]);
        expect(models.find((m: any) => m.id === "gemini-4-neon")!.reasoning!.variants!.default).toBe("gemini-4-neon-high");
        expect(levelsOf(models, "gemini-3.8-flash")).toEqual(["high", "medium", "low"]);
        // The response default belongs to Neon, so no other group claims it.
        expect(models.find((m: any) => m.id === "gemini-3.8-flash")!.reasoning!.variants!.default).toBeUndefined();
        // Lowest member bound when all report it; unspecified when one member does not.
        expect(models.find((m: any) => m.id === "gemini-4-neon")).toMatchObject({ contextWindow: 1048576, maxOutputTokens: 32768 });
        expect(models.find((m: any) => m.id === "claude-opus-5-5")).toMatchObject({ contextWindow: 200000 });
        expect("maxOutputTokens" in models.find((m: any) => m.id === "claude-opus-5-5")!).toBe(false);
        // Ungrouped ids: no invented levels from a name, numeric thinkingLevel or supportsThinking.
        for (const id of ["gemini-3-flash", "gemini-3-pro-high", "gemini-2.5-flash-lite"]) expect(models.find((m: any) => m.id === id)!.reasoning).toBeUndefined();
    });

    test("a disabled, absent, thinking-less or unrecognized member backs no level and no id is invented", async () => {
        const models = await map(inventory(inv => {
            inv.models["gemini-4-neon-xhigh"].disabled = true;
            delete inv.models["gemini-4-neon-low"];
            inv.models["gemini-4-neon-medium"].supportsThinking = false;
            inv.groupedModels["gemini-4-neon"].supportedThinkingLevels.push({ thinkingSuffix: "ultra" }, { thinkingSuffix: "minimal" });
        }));
        expect(levelsOf(models, "gemini-4-neon")).toEqual(["high"]);
        expect(membersOf(models, "gemini-4-neon")).toEqual(["gemini-4-neon-high"]);
        // The thinking-less member is still a visible model: it stays a standalone choice without levels.
        expect(models.find((m: any) => m.id === "gemini-4-neon-medium")).toEqual({ id: "gemini-4-neon-medium", contextWindow: 1048576, maxOutputTokens: 65536, family: "gemini" });
        expect(JSON.stringify(models)).not.toMatch(/neon-(xhigh|low|ultra|minimal)/);
        // No eligible member at all: the group is not offered.
        const none = await map(inventory(inv => { for (const s of ["low", "medium", "high"]) inv.models[`gemini-3.8-flash-${s}`].disabled = true; }));
        expect(none.some((m: any) => m.id === "gemini-3.8-flash")).toBe(false);
    });

    test("an ambiguous group gets no levels and its native models stay exact standalone choices", async () => {
        // The group key is itself a visible native id.
        const collide = await map(inventory(inv => { inv.models["gemini-4-neon"] = { modelProvider: G, maxTokens: 7 }; inv.agentModelSorts[0].groups[0].modelIds.push("gemini-4-neon"); }));
        expect(collide.find((m: any) => m.id === "gemini-4-neon")).toEqual({ id: "gemini-4-neon", contextWindow: 7, family: "gemini" });
        expect(collide.filter((m: any) => m.id.startsWith("gemini-4-neon")).map((m: any) => [m.id, m.reasoning])).toEqual([["gemini-4-neon-high", undefined], ["gemini-4-neon-xhigh", undefined], ["gemini-4-neon-medium", undefined], ["gemini-4-neon-low", undefined], ["gemini-4-neon", undefined]]);
        // A suffix that is not an SDK level never joins a member, so a second group cannot claim another group's id.
        const shared = await map({ models: { "x-pro-high": { modelProvider: G } }, agentModelSorts: [{ groups: [{ modelIds: ["x-pro-high"] }] }],
            groupedModels: { "x-pro": { supportedThinkingLevels: [{ thinkingSuffix: "high" }] }, "x": { supportedThinkingLevels: [{ thinkingSuffix: "pro-high" }, { thinkingSuffix: "high" }] } } });
        expect(shared).toEqual([{ id: "x-pro", family: "gemini", reasoning: { supported: ["high"], variants: { members: [{ level: "high", id: "x-pro-high" }] } } }]);
        const twice = await map({ models: { "y-high": { modelProvider: G } }, agentModelSorts: [{ groups: [{ modelIds: ["y-high"] }] }],
            groupedModels: { "y": { supportedThinkingLevels: [{ thinkingSuffix: "high" }, { thinkingSuffix: "high" }] } } });
        expect(twice).toEqual([{ id: "y-high", family: "gemini" }]);
        // Members of two vendors are not one group, whatever their names say.
        const mixed = await map(inventory(inv => { inv.models["gemini-4-neon-low"].modelProvider = "MODEL_PROVIDER_ANTHROPIC"; }));
        expect(mixed.some((m: any) => m.id === "gemini-4-neon")).toBe(false);
        expect(mixed.find((m: any) => m.id === "gemini-4-neon-low")).toMatchObject({ family: "claude" });
    });
});

describe("catalogue cache (2.1, 2.2)", () => {
    const stored = async (ctx: Context, id: string) => { const v = (await ctx.fns.procs.db.select({ sql: "SELECT models_cache FROM llm_connections WHERE id=?", params: [id] }))[0]!.models_cache; return (typeof v === "string" ? JSON.parse(v) : v) as any[]; };
    const overwrite = (ctx: Context, id: string, models: unknown[]) => ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET models_cache=?::jsonb, models_cached_at=? WHERE id=?", params: [JSON.stringify(models), Date.now(), id] });

    test("a persistent round trip keeps exact member ids, order, default and limits and nothing else", async () => {
        const w = await world();
        const c = await w.connect("cache");
        const raw = await stored(w.ctx, c.id);
        expect(raw.find((m: any) => m.id === "gemini-4-neon")).toEqual({ id: "gemini-4-neon", label: "Gemini 4 Neon", contextWindow: 1048576, maxOutputTokens: 32768, family: "gemini",
            reasoning: { supported: ["high", "xhigh", "medium", "low"], variants: { default: "gemini-4-neon-high", members: [{ level: "high", id: "gemini-4-neon-high" }, { level: "xhigh", id: "gemini-4-neon-xhigh" }, { level: "medium", id: "gemini-4-neon-medium" }, { level: "low", id: "gemini-4-neon-low" }] } } });
        // Member ids live in variants, never in the wire map of parameter values.
        expect(JSON.stringify(raw)).not.toMatch(/"wire"|quotaInfo|modelProvider|thinkingSuffix|supportsThinking/);
        delete w.ctx.state.models!.health;
        const again = await w.ctx.fns.models.listModels({ id: c.id, cacheOnly: true });
        expect(again.source).toBe("provider");
        expect(again.models.find((m: any) => m.id === "gemini-4-neon")!.reasoning).toEqual({ supported: ["high", "xhigh", "medium", "low"], default: "high",
            variants: { default: "gemini-4-neon-high", members: [{ level: "high", id: "gemini-4-neon-high" }, { level: "xhigh", id: "gemini-4-neon-xhigh" }, { level: "medium", id: "gemini-4-neon-medium" }, { level: "low", id: "gemini-4-neon-low" }] } });
        expect(w.lists().length).toBe(1);
    });

    test("invalid links are rejected and unrelated provider fields are dropped", async () => {
        const w = await world();
        const c = await w.connect("links");
        const ok = { supported: ["low", "high"], variants: { members: [{ level: "low", id: "a-low" }, { level: "high", id: "a-high" }], default: "a-high" } };
        await overwrite(w.ctx, c.id, [
            { id: "ok", family: "claude", reasoning: { ...ok, wire: { low: "a-low" }, extra: 1 }, quotaInfo: { remainingFraction: 1 }, modelProvider: "x", price: 3 },
            { id: "level-mismatch", reasoning: { supported: ["low", "high"], variants: { members: [{ level: "low", id: "b-low" }] } } },
            { id: "dup-id", reasoning: { supported: ["low", "high"], variants: { members: [{ level: "low", id: "c" }, { level: "high", id: "c" }] } } },
            { id: "self", reasoning: { supported: ["low"], variants: { members: [{ level: "low", id: "self" }] } } },
            { id: "blank", reasoning: { supported: ["low"], variants: { members: [{ level: "low", id: "has space" }] } } },
            { id: "steal-1", reasoning: { supported: ["low"], variants: { members: [{ level: "low", id: "shared" }] } } },
            { id: "steal-2", reasoning: { supported: ["low"], variants: { members: [{ level: "low", id: "shared" }] } } },
            { id: "native", family: "robot" }, { id: "hijack", reasoning: { supported: ["low"], variants: { members: [{ level: "low", id: "native" }] } } },
            { id: "foreign-default", reasoning: { supported: ["low"], variants: { members: [{ level: "low", id: "d-low" }], default: "elsewhere" } } },
            { id: "plain", reasoning: { supported: ["low", "high"], wire: { low: "LOW" } } },
        ]);
        const { models } = await w.ctx.fns.models.listModels({ id: c.id, cacheOnly: true });
        expect(models.find((m: any) => m.id === "ok")).toEqual({ id: "ok", family: "claude", disabled: false, reasoning: { supported: ["low", "high"], default: "high", variants: ok.variants } });
        for (const id of ["level-mismatch", "dup-id", "self", "blank", "steal-1", "steal-2", "hijack", "plain"]) expect([id, models.find((m: any) => m.id === id)!.reasoning]).toEqual([id, undefined]);
        expect(models.find((m: any) => m.id === "native")).toEqual({ id: "native", disabled: false });
        expect(models.find((m: any) => m.id === "foreign-default")!.reasoning).toEqual({ supported: ["low"], default: "low", variants: { members: [{ level: "low", id: "d-low" }] } });
    });

    test("picker, settings and list_models read one projection without a provider request; disables apply at once", async () => {
        const w = await world();
        const a = await w.connect("first");
        const b = await w.connect("second", "ya29.SECRET-other", false);
        const n = w.calls.length;
        const views = async () => {
            const picker = (await w.ctx.fns.frontendBridge.modelCatalogue({})).models.filter((m: any) => m.connectionId === a.id && !m.disabled).map((m: any) => [m.model, m.reasoning?.supported ?? []]);
            const tool = (await w.ctx.fns.tools.listModels({ provider: "antigravity" })).models.filter((m: any) => m.route.startsWith("antigravity/first:")).map((m: any) => [m.route, m.reasoning]);
            const settings = (await w.ctx.fns.models.listModels({ id: a.id })).models.filter((m: any) => !m.disabled).map((m: any) => [a.route(m.id), m.reasoning?.supported ?? []]);
            return { picker, tool, settings };
        };
        const all = await views();
        expect(all.picker).toEqual(all.tool);
        expect(all.settings).toEqual(all.tool);
        expect(all.tool).toEqual([[a.route("gemini-4-neon"), ["high", "xhigh", "medium", "low"]], [a.route("gemini-3.8-flash"), ["high", "medium", "low"]], [a.route("gemini-3-flash"), []],
            [a.route("claude-opus-5-5"), ["low", "medium", "high"]], [a.route("gemini-3-pro-high"), []], [a.route("gemini-2.5-flash-lite"), []]]);
        // No member rows, and a signed-in connection with a cold catalogue borrows nothing from the first.
        expect(JSON.stringify(all)).not.toMatch(/neon-(high|xhigh|medium|low)/);
        expect((await w.ctx.fns.tools.listModels({})).models.some((m: any) => m.route.startsWith("antigravity/second:"))).toBe(false);
        expect((await w.ctx.fns.models.listModels({ id: b.id, cacheOnly: true })).models).toEqual([]);

        await w.ctx.fns.models.setModelEnabled({ id: a.id, model: "gemini-4-neon-high", enabled: false });
        const member = await views();
        expect(member.tool[0]).toEqual([a.route("gemini-4-neon"), ["xhigh", "medium", "low"]]);
        expect(member.picker).toEqual(member.tool);
        expect(member.settings).toEqual(member.tool);
        // Auto can no longer land on the disabled default member.
        expect((await w.ctx.fns.models.listModels({ id: a.id, cacheOnly: true })).models[0]!.reasoning!.default).toBe("xhigh");
        for (const s of ["low", "medium", "high"]) await w.ctx.fns.models.setModelEnabled({ id: a.id, model: `claude-opus-5-5-${s}`, enabled: false });
        await w.ctx.fns.models.setModelEnabled({ id: a.id, model: "gemini-3.8-flash", enabled: false });
        const gone = await views();
        expect(gone.tool.map((r: any) => r[0])).toEqual([a.route("gemini-4-neon"), a.route("gemini-3-flash"), a.route("gemini-3-pro-high"), a.route("gemini-2.5-flash-lite")]);
        expect(gone.picker).toEqual(gone.tool);
        expect(gone.settings).toEqual(gone.tool);
        for (const route of ["claude-opus-5-5", "gemini-3.8-flash"]) await expect(w.ctx.fns.models.resolveRoute({ route: a.route(route) })).rejects.toMatchObject({ code: expect.stringMatching(/MODEL_UNAVAILABLE|MODEL_DISABLED_BY_USER/) });
        // A legacy native member route cannot bypass the group or member disable.
        await expect(w.ctx.fns.models.resolveRoute({ route: a.route("claude-opus-5-5-high") })).rejects.toMatchObject({ code: "MODEL_DISABLED_BY_USER" });
        await expect(w.ctx.fns.models.resolveRoute({ route: a.route("gemini-3.8-flash-high") })).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
        expect(w.calls.length).toBe(n);
    });

    test("two connections keep their own mapping for the same group key", async () => {
        let n = 0;
        const w = await world({ inventory: () => ++n === 1 ? INVENTORY : inventory(inv => { delete inv.models["gemini-4-neon-xhigh"]; delete inv.models["gemini-4-neon-high"]; }) });
        const a = await w.connect("one");
        const b = await w.connect("two", "ya29.SECRET-other");
        const neon = async (id: string) => (await w.ctx.fns.models.listModels({ id, cacheOnly: true })).models.find((m: any) => m.id === "gemini-4-neon")!.reasoning;
        expect(await neon(a.id)).toMatchObject({ supported: ["high", "xhigh", "medium", "low"], default: "high" });
        expect(await neon(b.id)).toEqual({ supported: ["medium", "low"], default: "medium", variants: { members: [{ level: "medium", id: "gemini-4-neon-medium" }, { level: "low", id: "gemini-4-neon-low" }] } });
    });
});

describe("routes resolve only against the current catalogue (2.3)", () => {
    test("a catalogue cached before groups offers no levels and fetches nothing; a refresh upgrades it and drops old routes", async () => {
        const w = await world({ stream: () => new Response("unexpected", { status: 500 }) });
        const c = await w.connect("legacy", ACCESS, false);
        await w.ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET models_cache=?::jsonb, models_cached_at=? WHERE id=?", params: [JSON.stringify([
            { id: "gemini-3-flash", reasoning: { supported: ["minimal", "low", "medium", "high"] } }, { id: "gemini-3.5-pro-low", reasoning: { supported: ["low", "high"] } }]), 1, c.id] });
        const agent = await w.ctx.fns.agent.start({ model: c.route("gemini-3.5-pro-low") });
        await w.ctx.fns.procs.db.run({ sql: "UPDATE agents SET reasoning_effort='high' WHERE id=?", params: [agent.id] });
        await w.ctx.fns.procs.db.run({ sql: "INSERT INTO kv (key, value) VALUES ('last-model', ?) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", params: [c.route("gemini-3.5-pro-low")] });
        const saved = async () => [(await w.ctx.fns.procs.db.select({ sql: "SELECT model, reasoning_effort FROM agents WHERE id=?", params: [agent.id] }))[0], (await w.ctx.fns.procs.db.select({ sql: "SELECT value FROM kv WHERE key='last-model'", params: [] }))[0]];
        const before = await saved();
        const n = w.calls.length;
        const legacy = await w.ctx.fns.models.listModels({ id: c.id, cacheOnly: true });
        expect(legacy.models).toEqual([{ id: "gemini-3-flash", disabled: false }, { id: "gemini-3.5-pro-low", disabled: false }]);
        expect((await w.ctx.fns.tools.listModels({ provider: "antigravity" })).models.map((m: any) => m.reasoning)).toEqual([[], []]);
        expect((await w.ctx.fns.frontendBridge.modelCatalogue({})).models.every((m: any) => !m.reasoning)).toBe(true);
        expect((await w.ctx.fns.models.resolveRoute({ route: c.route("gemini-3.5-pro-low") })).model).toBe("gemini-3.5-pro-low");
        expect(w.calls.length).toBe(n);

        const fresh = await w.ctx.fns.models.listModels({ id: c.id, refresh: true });
        expect(fresh.models.map((m: any) => m.id)).toEqual(["gemini-4-neon", "gemini-3.8-flash", "gemini-3-flash", "claude-opus-5-5", "gemini-3-pro-high", "gemini-2.5-flash-lite"]);
        const m = w.calls.length;
        for (const model of ["gemini-3.5-pro-low", "gemini-4-neon-high", "claude-sonnet-4-6"]) {
            await expect(w.ctx.fns.models.resolveRoute({ route: c.route(model) })).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
            const err = await w.ctx.fns.models.stream({ connectionId: c.id, model, instructions: "", sessionId: "s", messages: [{ role: "user", content: "hi" }] }).then(() => null, (e: any) => e);
            expect(err.failure).toMatchObject({ code: "MODEL_UNAVAILABLE", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true });
            expect(err.message).toContain(c.route(model));
        }
        expect(w.calls.length).toBe(m);
        // No migration: the chat keeps its route and preference, and nothing was substituted.
        expect(await saved()).toEqual(before);
        expect(w.ctx.fns.agent.retryCodes({}).never).toContain("MODEL_UNAVAILABLE");
    });

    test("a failed refresh keeps the last valid mapping", async () => {
        let fail = false;
        const w = await world({ inventory: () => fail ? new Response("{}", { status: 503 }) : INVENTORY });
        const c = await w.connect("flaky");
        const good = await w.ctx.fns.models.listModels({ id: c.id, cacheOnly: true });
        fail = true;
        const failed = await w.ctx.fns.models.listModels({ id: c.id, refresh: true });
        expect(failed.error).toBeTruthy();
        expect(failed.models).toEqual(good.models);
        expect(failed.cachedAt).toBe(good.cachedAt);
        expect((await w.ctx.fns.models.resolveRoute({ route: c.route("gemini-4-neon") })).model).toBe("gemini-4-neon");
    });

    test("a refresh of the old account that finishes after logout or a new sign-in publishes nothing", async () => {
        for (const change of ["logout", "replace"] as const) {
            let release!: () => void;
            const gate = new Promise<void>(resolve => { release = resolve; });
            let slow = false;
            const w = await world({ inventory: async () => { if (slow) await gate; return slow ? INVENTORY : { models: {} }; } });
            const c = await w.connect("late-" + change, ACCESS, false);
            slow = true;
            const pending = w.ctx.fns.models.listModels({ id: c.id, refresh: true });
            while (!w.lists().length) await Bun.sleep(5);
            if (change === "logout") await w.ctx.fns.models.action({ id: c.id, action: "logout" });
            else await w.ctx.fns.models.provider.antigravity.auth({ conn: c.conn, op: "store", tokens: { access_token: "ya29.SECRET-new", refresh_token: "r", expires_in: 3600 } });
            release();
            const late = await pending;
            expect(late).toMatchObject({ models: [], source: "manual" });
            expect(late.error).toBeTruthy();
            expect(await w.ctx.fns.models.listModels({ id: c.id, cacheOnly: true })).toMatchObject({ models: [], source: "manual", cachedAt: null });
            await expect(w.ctx.fns.models.resolveRoute({ route: c.route("gemini-4-neon") })).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
        }
    });
});
