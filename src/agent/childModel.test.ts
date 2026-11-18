// FUNCTIONAL test: child model and reasoning effort selection on a real test database, no provider requests.
import { beforeAll, describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import codex from "../models/$modelProvider_codex";

beforeAll(async () => { await mkTestCtx(); }, 60000);

async function setup() {
    const ctx: any = await mkTestCtx();
    let requests = 0;
    const forbidden = () => { requests++; throw Error("Provider/secret/network access forbidden"); };
    ctx.state.models.providers = {};
    for (const original of [codex, { id: "custom", fields: [], transports: ["direct"], test: forbidden }] as any[]) {
        ctx.state.models.providers[original.id] = { owner: "core", module: "models", rel: "fixture", definition: { ...original, fields: [], validate: undefined, listModels: forbidden } };
    }
    ctx.state.registry.models.transport.fetch = forbidden;
    ctx.state.registry.secrets.getLocal = forbidden;
    ctx.state.registry.models.catalog.priceCatalog = async () => ({});
    ctx.fns.agent.wakeWorker = () => {};
    const work = await ctx.fns.models.create({ provider: "codex", accountName: "work" });
    const cache = [
        { id: "fast", label: "Fast", reasoning: { supported: ["low", "medium", "high"], default: "medium" } },
        { id: "plain" },
    ];
    await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET models_cache=?::jsonb, models_cached_at=? WHERE id=?", params: [JSON.stringify(cache), Date.now(), work.id] });
    const parent = await ctx.fns.agent.start({ model: "codex/work:plain", title: "Parent" });
    const children = async () => (await ctx.fns.procs.db.select({ sql: "SELECT id FROM agents WHERE parent_id = ?", params: [parent.id] })).length;
    return { ctx, work, parent, children, requests: () => requests };
}

const loaded = async (ctx: any, id: string) => await ctx.fns.session.load({ id });

describe("child model selection", () => {
    test("omitted model and effort: child inherits the parent model and starts with auto, no event", async () => {
        const { ctx, parent } = await setup();
        await ctx.fns.agent.setReasoningEffort({ id: parent.id, effort: "off" }).catch(() => {});
        const member = await ctx.fns.agent.delegate({ agent: parent, title: "Inherit", tasks: [{ id: "a", title: "A" }] });
        const child = await loaded(ctx, member.id);
        expect(child.model).toBe("codex/work:plain");
        expect(child.reasoningEffort).toBe("auto");
        const events = await ctx.fns.session.getEvents({ id: member.id });
        expect(events.some((e: any) => e.type === "child_model_selected")).toBe(false);
    });

    test("a valid route and effort are applied and recorded as a visible event", async () => {
        const { ctx, parent, requests } = await setup();
        const member = await ctx.fns.agent.delegate({ agent: parent, title: "Pick", tasks: [{ id: "a", title: "A" }], model: "codex/work:fast", reasoningEffort: "high" });
        const child = await loaded(ctx, member.id);
        expect(child.model).toBe("codex/work:fast");
        expect(child.reasoningEffort).toBe("high");
        const events = await ctx.fns.session.getEvents({ id: member.id });
        expect(events.find((e: any) => e.type === "child_model_selected")).toMatchObject({ model: "codex/work:fast", reasoningEffort: "high", explicitModel: true, explicitReasoningEffort: true });
        expect(requests()).toBe(0);
    });

    test("unknown route, disabled provider, connection or model are rejected and no child is created", async () => {
        const { ctx, work, parent, children } = await setup();
        const attempt = (model: string) => ctx.fns.agent.delegate({ agent: parent, title: "Bad", tasks: [{ id: "a", title: "A" }], model });
        await expect(attempt("codex/missing:fast")).rejects.toThrow(/codex\/missing:fast.*list_models/);
        await expect(attempt("not a route")).rejects.toThrow(/list_models/);
        await ctx.fns.models.setModelEnabled({ id: work.id, model: "fast", enabled: false });
        await expect(attempt("codex/work:fast")).rejects.toThrow(/list_models/);
        await ctx.fns.models.setModelEnabled({ id: work.id, model: "fast", enabled: true });
        await ctx.fns.models.update({ id: work.id, enabled: false });
        await expect(attempt("codex/work:fast")).rejects.toThrow(/list_models/);
        await ctx.fns.models.update({ id: work.id, enabled: true });
        await ctx.fns.settings.set({ module: "models", scopeType: "global", key: "disabledProviders", value: ["codex"] });
        await expect(attempt("codex/work:fast")).rejects.toThrow(/list_models/);
        expect(await children()).toBe(0);
    });

    test("unsupported effort is rejected and no child is created", async () => {
        const { ctx, parent, children } = await setup();
        const attempt = (model: string | undefined, reasoningEffort: any) => ctx.fns.agent.delegate({ agent: parent, title: "Bad", tasks: [{ id: "a", title: "A" }], ...(model ? { model } : {}), reasoningEffort });
        await expect(attempt("codex/work:fast", "xhigh")).rejects.toThrow(/does not support reasoning effort xhigh.*list_models/);
        await expect(attempt("codex/work:plain", "low")).rejects.toThrow(/list_models/);
        await expect(attempt(undefined, "ultra")).rejects.toThrow(/unsupported reasoning effort/);
        expect(await children()).toBe(0);
    });

    test("sharedAgent.delegate honours the options and validates before the fork", async () => {
        const { ctx, parent } = await setup();
        await ctx.fns.procs.db.run({ sql: "INSERT INTO kv(key, value) VALUES (?, ?)", params: ["shared-agent:" + parent.id, JSON.stringify({ name: "Ctx" })] });
        const ok = await ctx.fns.sharedAgent.delegate({ agentId: parent.id, task: "Review", model: "codex/work:fast", reasoningEffort: "low" });
        const child = await loaded(ctx, ok.childId);
        expect(child.model).toBe("codex/work:fast");
        expect(child.reasoningEffort).toBe("low");
        const inherited = await loaded(ctx, (await ctx.fns.sharedAgent.delegate({ agentId: parent.id, task: "Again" })).childId);
        expect(inherited.model).toBe("codex/work:plain");
        expect(inherited.reasoningEffort).toBe("auto");
        const before = (await ctx.fns.procs.db.select({ sql: "SELECT id FROM agents", params: [] })).length;
        await expect(ctx.fns.sharedAgent.delegate({ agentId: parent.id, task: "Bad", model: "codex/gone:x" })).rejects.toThrow(/list_models/);
        expect((await ctx.fns.procs.db.select({ sql: "SELECT id FROM agents", params: [] })).length).toBe(before);
    });

    test("delegate_task passes model and effort and still rejects unknown arguments", async () => {
        const { ctx, parent } = await setup();
        parent.preset = { presetId: "test", name: "Test", layers: [{ id: "test", allow: ["*"], deny: [], plugins: [], prompt: "", excludeSections: [] }] };
        await ctx.fns.session.save({ agent: parent });
        const call = (args: unknown) => ctx.fns.tools.call({ name: "delegate_task", args, agent: parent });
        const ok = await call({ title: "x", tasks: [{ id: "a", title: "A" }], model: "codex/work:fast", reasoningEffort: "medium" });
        expect(ok.isError).toBe(false);
        const child = await loaded(ctx, JSON.parse(ok.output).id);
        expect(child).toMatchObject({ model: "codex/work:fast", reasoningEffort: "medium" });
        const bad = await call({ title: "x", tasks: [{ id: "a", title: "A" }], modelName: "codex/work:fast" });
        expect(bad.isError).toBe(true);
        expect(bad.output).toMatch(/invalid arguments|unknown argument/);
    });
});

describe("models.selectable", () => {
    test("lists enabled routes with reasoning levels, hides disabled entries and sends no request", async () => {
        const { ctx, work, requests } = await setup();
        expect(await ctx.fns.models.selectable({})).toEqual({ total: 2, models: [
            { route: "codex/work:fast", label: "Fast", reasoning: ["low", "medium", "high"] },
            { route: "codex/work:plain", label: "plain", reasoning: [] },
        ] });
        await ctx.fns.models.setModelEnabled({ id: work.id, model: "fast", enabled: false });
        expect((await ctx.fns.models.selectable({})).models.map((m: any) => m.route)).toEqual(["codex/work:plain"]);
        await ctx.fns.models.update({ id: work.id, enabled: false });
        expect((await ctx.fns.models.selectable({})).models).toEqual([]);
        await ctx.fns.models.update({ id: work.id, enabled: true });
        await ctx.fns.settings.set({ module: "models", scopeType: "global", key: "disabledProviders", value: ["codex"] });
        expect((await ctx.fns.models.selectable({})).models).toEqual([]);
        const cold = await ctx.fns.models.create({ provider: "custom", accountName: "Cold" });
        expect(cold.id).toBeTruthy();
        expect((await ctx.fns.models.selectable({})).models).toEqual([]);
        expect(requests()).toBe(0);
    });
});
