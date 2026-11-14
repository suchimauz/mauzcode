import { expect, test } from "bun:test";
import checkGoal from "./checkGoal";
import summarize from "./readAndSummarize";

const model = "custom/work:new/model:v2";
function fixture(text = '{"status":"achieved","reason":"evidence","evidence":["file"]}') {
    const calls: types.models.CallRequest[] = []; const routes: string[] = [];
    const agent = { id: "child", model, goal: { enabled: true, statement: "build it" }, abortController: new AbortController() } as unknown as types.agent.Agent;
    const ctx: any = { fns: { agent: {requireModel:({model}:any)=>model},
        session: { getFullMessages: async () => [{ role: "user", content: "task" }] },
        files: { exists: async () => true, read: async () => "long document" },
        models: {
            resolveRoute: async (opts: { route: string }) => { expect(Object.keys(opts)).toEqual(["route"]); expect(typeof opts.route).toBe("string"); routes.push(opts.route); return { connectionId: "connection", model: "new/model:v2" }; },
            call: async (opts: types.models.CallRequest) => { calls.push(opts); return { text, usage: { prompt_tokens: 8, completion_tokens: 2 } }; },
        },
    } };
    return { ctx, agent, calls, routes };
}
test("goal checker routes once, retains transcript, cancellation, JSON verdict and goal ownership", async () => {
    const { ctx, agent, calls, routes } = fixture(); const goal = JSON.stringify(agent.goal);
    expect(await checkGoal(ctx, null, { agent, candidateAnswer: "done" })).toMatchObject({ status: "achieved", reason: "evidence", evidence: ["file"] });
    expect(routes).toEqual([model]); expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ connectionId: "connection", model: "new/model:v2", sessionId: agent.id, temperature: 0, signal: agent.abortController!.signal });
    expect(JSON.parse(calls[0]!.user)).toMatchObject({ goal: "build it", candidateAnswer: "done", recent: [{ role: "user", content: "task" }] });
    expect(JSON.stringify(agent.goal)).toBe(goal);
    agent.goal!.enabled = false;
    expect(await checkGoal(ctx, null, { agent, candidateAnswer: "" })).toMatchObject({ status: "achieved", reason: "goal disabled" });
    expect(calls).toHaveLength(1);
});
test("summary keeps file bounds, usage, override and signal without an alternate model", async () => {
    const { ctx, agent, calls, routes } = fixture("summary");
    expect(await summarize(ctx, null, { agent, file: "doc", task: "find result", maxChars: 4, model: "custom/other:model" })).toEqual({ file: "doc", summary: "summary", usage: { prompt_tokens: 8, completion_tokens: 2 } });
    expect(routes).toEqual(["custom/other:model"]);
    expect(calls[0]).toMatchObject({ connectionId: "connection", model: "new/model:v2", sessionId: agent.id, signal: agent.abortController!.signal });
    expect(calls[0]!.user).toContain("long\n[truncated; original chars=13]");
});
for (const phase of ["resolution", "provider"] as const) {
    test(`${phase} failure preserves goal blocked verdict and summary error with no fallback`, async () => {
        const { ctx, agent, calls, routes } = fixture(); const error = new Error(phase === "resolution" ? "CONNECTION_DISABLED" : "quota exhausted");
        if (phase === "resolution") ctx.fns.models.resolveRoute = async (o: { route: string }) => { expect(o).toEqual({ route: model }); routes.push(o.route); throw error; };
        else ctx.fns.models.call = async (o: types.models.CallRequest) => { calls.push(o); throw error; };
        expect(await checkGoal(ctx, null, { agent, candidateAnswer: "done" })).toEqual({ status: "blocked", reason: `goal checker failed: ${error.message}` });
        await expect(summarize(ctx, null, { agent, file: "doc", task: "summarize" })).rejects.toBe(error);
        expect(calls).toHaveLength(phase === "resolution" ? 0 : 2);
        expect(routes).toEqual([model, model]);
    });
}
test("malformed goal output remains blocked without mutating goal", async () => {
    const { ctx, agent } = fixture("not JSON"); const goal = JSON.stringify(agent.goal);
    expect((await checkGoal(ctx, null, { agent, candidateAnswer: "" })).status).toBe("blocked");
    expect(JSON.stringify(agent.goal)).toBe(goal);
});
