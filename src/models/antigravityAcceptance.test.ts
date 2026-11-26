import { beforeAll, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";
import { runClaimed } from "../agent/modelsTestCtx.entry";
import antigravity from "./$modelProvider_antigravity";
import quotasRoute from "../api/$route_v1_quotas_GET";
import QUOTA_ACCOUNT from "./fixtures/antigravity-quota-account.json";
import { ACCESS, INVENTORY, REFRESH, RESET, SUMMARY_BODY, sse, text, world, wrap } from "./fixtures/antigravityWorld.entry";

beforeAll(async () => { await mkTestCtx(); }, 60000);

// Fixture-backed path from discovery to the quota views: real catalogue, agent, SDK and provider code over a fake
// transport. No account, no credentials and no live generation.
test("discovery, restart, chat and delegation selection, generation and quota views (6.1)", async () => {
    const w = await world({ stream: (call, n) => n === 1
        ? sse([wrap({ candidates: [{ content: { parts: [{ functionCall: { name: "list_models", args: {} }, thoughtSignature: "sig-1" }] }, finishReason: "STOP" }] })])
        : text("done " + call.body.model) });
    const c = await w.connect("work", ACCESS, false);
    expect(await w.ctx.fns.models.test({ id: c.id })).toMatchObject({ status: "available", reason: "models-ok" });
    await w.ctx.fns.models.refreshAll({});
    const picker = async (ctx: Context) => (await ctx.fns.frontendBridge.modelCatalogue({})).models.filter(m => m.connectionId === c.id).map(m => [m.model, m.reasoning?.supported ?? []]);
    const tool = async (ctx: Context) => (await ctx.fns.tools.listModels({ provider: "antigravity" })).models.map(m => [m.route, m.reasoning]);
    const before = await picker(w.ctx);
    expect(before.slice(0, 2)).toEqual([[c.route("gemini-4-neon"), ["high", "xhigh", "medium", "low"]], [c.route("gemini-3.8-flash"), ["high", "medium", "low"]]]);
    expect(await tool(w.ctx)).toEqual(before);

    // Restart: a fresh process state over the same database reads the same choices without contacting the provider.
    const restarted = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64") } });
    restarted.state.models = { ...(restarted.state.models ?? {}), providers: { ...(restarted.state.models?.providers ?? {}), antigravity: { owner: "core", module: "models", rel: "models/$modelProvider_antigravity.ts", definition: antigravity } }, health: {} };
    let remote = 0;
    restarted.state.registry.models.transport.fetch = async () => { remote++; throw new Error("no provider request after restart"); };
    expect(await picker(restarted)).toEqual(before);
    expect(await tool(restarted)).toEqual(before);
    const neon = (await restarted.fns.models.listModels({ id: c.id, cacheOnly: true })).models.find((m: types.models.ModelInfo) => m.id === "gemini-4-neon")!;
    expect(neon.reasoning!.variants!.members.find((m: { level: string }) => m.level === "xhigh")!.id).toBe("gemini-4-neon-xhigh");
    expect(remote).toBe(0);

    // Chat selection: the saved route is the group, the saved level picks the member; a tool turn continues on it.
    const agent = await w.ctx.fns.agent.start({ model: c.route("gemini-4-neon") });
    await w.ctx.fns.agent.setReasoningEffort({ id: agent.id, effort: "xhigh" });
    await expect(w.ctx.fns.agent.setReasoningEffort({ id: agent.id, effort: "minimal" })).rejects.toThrow(/unsupported reasoning effort/);
    const live = await w.ctx.fns.session.load({ id: agent.id });
    w.ctx.state.agent[live.id] = live;
    await runClaimed(w.ctx, live, "List the models.");
    expect(w.gens().map(g => [g.body.model, g.body.project, g.headers.authorization])).toEqual([
        ["gemini-4-neon-xhigh", "proj-cess", "Bearer " + ACCESS], ["gemini-4-neon-xhigh", "proj-cess", "Bearer " + ACCESS]]);
    for (const g of w.gens()) expect(JSON.stringify(g.body.request.generationConfig ?? {})).not.toMatch(/thinking/i);
    const turn = w.gens()[1]!.body.request.contents;
    expect(turn.flatMap((x: any) => x.parts).filter((p: any) => p.functionCall)).toEqual([{ functionCall: { name: "list_models", args: {} }, thoughtSignature: "sig-1" }]);
    expect(JSON.stringify(turn)).toContain(c.route("claude-opus-5-5"));
    expect((await w.ctx.fns.procs.db.select({ sql: "SELECT model, reasoning_effort FROM agents WHERE id=?", params: [agent.id] }))[0]).toEqual({ model: c.route("gemini-4-neon"), reasoning_effort: "xhigh" });

    // Delegation selection: a Claude group with a listed level; an unlisted level is refused before a child exists.
    await expect(w.ctx.fns.agent.delegate({ agent: live, title: "No", tasks: [{ id: "t", title: "T" }], model: c.route("claude-opus-5-5"), reasoningEffort: "xhigh" })).rejects.toThrow(/does not support reasoning effort xhigh/);
    const child = await w.ctx.fns.agent.delegate({ agent: live, title: "Claude child", tasks: [{ id: "t", title: "T" }], model: c.route("claude-opus-5-5"), reasoningEffort: "medium" });
    expect((await w.ctx.fns.procs.db.select({ sql: "SELECT model, reasoning_effort FROM agents WHERE id=?", params: [child.id] }))[0]).toEqual({ model: c.route("claude-opus-5-5"), reasoning_effort: "medium" });
    const claude = await w.ctx.fns.models.stream({ connectionId: c.id, model: "claude-opus-5-5", reasoningEffort: "medium", instructions: "", sessionId: child.id, messages: [{ role: "user", content: "hi" }] });
    expect(claude.text).toBe("done claude-opus-5-5-medium");
    expect(w.gens().at(-1)!.headers.authorization).toBe("Bearer " + ACCESS);

    // Quota views: one account, two families, group/period summary readings shared by the API and settings.
    const usage = await w.ctx.fns.models.usage({ id: c.id });
    const accounts = ((await (await quotasRoute(w.ctx, null, { req: new Request("http://x/api/v1/quotas"), params: {} })).json()) as any).accounts.filter((a: any) => a.provider === "antigravity");
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: c.id, label: "Antigravity · work", kind: "quota", windows: {}, families: [{ family: "gemini", partial: false }, { family: "claude", partial: false }] });
    const of = (family: string) => accounts[0].additionalWindows.filter((x: any) => x.family === family).map((x: any) => [x.bucket, x.period, x.usedPercent, x.resetsAt]);
    expect(of("gemini")).toEqual([["gemini-5h", "fiveHour", 20, RESET], ["gemini-weekly", "weekly", 60, Date.parse("2031-01-08T00:00:00Z")]]);
    expect(of("claude")).toEqual([["3p-5h", "fiveHour", 10, Date.parse("2031-01-02T05:00:00Z")], ["3p-weekly", "weekly", 75, Date.parse("2031-01-09T00:00:00Z")]]);
    expect(accounts[0].additionalWindows.map((x: any) => [x.bucket, x.usedPercent])).toEqual(usage.windows!.map((x: any) => [x.bucket, x.usedPercent ?? null]));

    // The same account, with volatile fields fixed, is the fixture the sidebar test renders as two cards
    // (frontend/src/test/quota-antigravity-acceptance.test.tsx): the views are checked against real API output.
    expect({ ...accounts[0], id: "antigravity-work", icon: null, quotaUpdatedAt: 1, additionalWindows: accounts[0].additionalWindows.map((x: any) => ({ ...x, observedAt: 1 })) }).toEqual(QUOTA_ACCOUNT as any);

    // Fixtures carry no credentials or account dump, and nothing secret reached a catalogue, quota view or model request.
    expect(JSON.stringify([INVENTORY, SUMMARY_BODY])).not.toMatch(/_token|bearer|secret|ya29|1\/\/|@|email|project|experiment|prompt/i);
    expect(JSON.stringify([before, accounts, usage, w.gens().map(g => g.body)])).not.toContain(ACCESS);
    expect(JSON.stringify(w.calls.map(x => x.body))).not.toContain(REFRESH);
    expect(w.calls.every(x => x.url.startsWith("https://daily-cloudcode-pa.googleapis.com/v1internal:"))).toBe(true);
}, 60000);
