// FUNCTIONAL test: native todo_update, todo_done, delegate_task and finish_task on a real test database.
import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

const snapshot = (allow: string[], deny: string[] = []): types.agentPreset.Snapshot =>
    ({ presetId: "test", name: "TestPreset", layers: [{ id: "test", allow, deny, plugins: [], prompt: "", excludeSections: [] }] });
const NAMES = ["todo_update", "todo_done", "delegate_task", "finish_task"];

async function setup(preset?: types.agentPreset.Snapshot) {
    const ctx: any = await mkTestCtx();
    ctx.fns.agent.wakeWorker = () => {};
    const agent = await ctx.fns.agent.start({ model: "test:model", systemPrompt: "", title: "Parent" });
    agent.preset = preset ?? snapshot(["*"]);
    await ctx.fns.session.save({ agent });
    const call = (name: string, args: unknown, who = agent) => ctx.fns.tools.call({ name, args, agent: who });
    const stored = async (id = agent.id) => (await ctx.fns.session.load({ id }))?.scratchpad ?? {};
    return { ctx, agent, call, stored };
}

const states = (todos: any) => todos.tasks.map((task: any) => `${task.id}:${task.status}`);

describe("todo_update", () => {
    test("creates todos with the first todo active", async () => {
        const { call, stored } = await setup();
        const result = await call("todo_update", { title: "Work", tasks: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] });
        expect(result.isError).toBe(false);
        expect(JSON.parse(result.output)).toMatchObject({ created: true, title: "Work", active: ["a"] });
        expect(states((await stored()).todos)).toEqual(["a:active", "b:pending", "c:pending"]);
    });

    test("revises todos, keeping the state of kept ids", async () => {
        const { call, stored } = await setup();
        await call("todo_update", { tasks: [{ id: "a", title: "A" }, { id: "b", title: "B" }] });
        await call("todo_done", { id: "a" });
        const result = await call("todo_update", { tasks: [{ id: "a", title: "A again" }, { id: "b", title: "B" }, { id: "b2", title: "B2" }] });
        expect(result.isError).toBe(false);
        expect(JSON.parse(result.output)).toMatchObject({ created: false, active: ["b"] });
        const todos = (await stored()).todos;
        expect(states(todos)).toEqual(["a:done", "b:active", "b2:pending"]);
        expect(todos.tasks[0].title).toBe("A again");
        // Removing the active task is refused by the shared rules, unchanged.
        expect((await call("todo_update", { tasks: [{ id: "a", title: "A" }, { id: "c", title: "C" }] })).output).toMatch(/cannot be removed/);
        // A completed list extended with a new id activates it.
        await call("todo_done", { id: "b" });
        await call("todo_done", { id: "b2" });
        await call("todo_update", { tasks: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "b2", title: "B2" }, { id: "c", title: "C" }] });
        expect(states((await stored()).todos)).toEqual(["a:done", "b:done", "b2:done", "c:active"]);
    });

    test("duplicate, empty and over-long ids leave the todos unchanged", async () => {
        const { call, stored } = await setup();
        await call("todo_update", { tasks: [{ id: "a", title: "A" }] });
        const before = JSON.stringify((await stored()).todos);
        for (const tasks of [[{ id: "x", title: "X" }, { id: "x", title: "Y" }], [{ id: "", title: "X" }], [{ id: "x".repeat(121), title: "X" }], [{ id: "x", title: "" }], []]) {
            const result = await call("todo_update", { tasks });
            expect(result.isError).toBe(true);
        }
        expect(JSON.stringify((await stored()).todos)).toBe(before);
        // Also a fresh agent: a rejected first list is not created.
        const fresh = await setup();
        expect((await fresh.call("todo_update", { tasks: [{ id: "x", title: "X" }, { id: "x", title: "Y" }] })).output).toMatch(/duplicate todo id/);
        expect((await fresh.stored()).todos).toBeUndefined();
    });
});

describe("todo_update parallel start", () => {
    test("status active starts pending todos in parallel and returns every active id", async () => {
        const { call, stored } = await setup();
        await call("todo_update", { tasks: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] });
        const out = JSON.parse((await call("todo_update", { tasks: [{ id: "a", title: "A" }, { id: "b", title: "B", status: "active" }, { id: "c", title: "C" }] })).output);
        expect(out.active).toEqual(["a", "b"]);
        const bad = await call("todo_update", { tasks: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C", status: "pending" }] });
        expect(bad.isError).toBe(true);
        expect(states((await stored()).todos)).toEqual(["a:active", "b:active", "c:pending"]);
        const done = JSON.parse((await call("todo_done", { id: "a" })).output);
        expect(done).toMatchObject({ next: null, active: [{ id: "b" }], complete: false });
    });
});

describe("todo_done", () => {
    test("completes the active todo and returns the next one", async () => {
        const { call, stored } = await setup();
        await call("todo_update", { tasks: [{ id: "a", title: "A" }, { id: "b", title: "B", instructions: "do b" }] });
        const out = JSON.parse((await call("todo_done", { id: "a" })).output);
        expect(out).toMatchObject({ completed: { id: "a" }, alreadyDone: false, next: { id: "b", instructions: "do b" }, complete: false, progress: { done: 1, total: 2 } });
        expect(states((await stored()).todos)).toEqual(["a:done", "b:active"]);
    });

    test("is idempotent for a done todo and rejects pending or unknown ids without changes", async () => {
        const { call, stored } = await setup();
        await call("todo_update", { tasks: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] });
        await call("todo_done", { id: "a" });
        expect(JSON.parse((await call("todo_done", { id: "a" })).output)).toMatchObject({ alreadyDone: true });
        expect(states((await stored()).todos)).toEqual(["a:done", "b:active", "c:pending"]);
        const before = JSON.stringify((await stored()).todos);
        const pending = await call("todo_done", { id: "c" });
        expect(pending.isError).toBe(true);
        expect(pending.output).toMatch(/not active/);
        expect((await call("todo_done", { id: "zzz" })).output).toMatch(/unknown todo id/);
        expect(JSON.stringify((await stored()).todos)).toBe(before);
    });
});

describe("delegate_task and finish_task", () => {
    test("returns the child id at once; the child is a working member with those todos", async () => {
        const { ctx, call, agent } = await setup();
        ctx.fns.agent.run = async () => { throw new Error("delegate_task must not run the child inline"); };
        const result = await call("delegate_task", { title: "Count", tasks: [{ id: "count", title: "Count files", instructions: "count them" }] });
        expect(result.isError).toBe(false);
        const out = JSON.parse(result.output);
        expect(out).toEqual({ id: expect.any(String), status: "working" });
        const child = ctx.state.agent[out.id];
        expect(child.parentId).toBe(agent.id);
        expect(states(child.scratchpad.todos)).toEqual(["count:active"]);
        const members = await ctx.fns.agent.team({ agent });
        expect(members.find((m: any) => m.id === out.id)).toMatchObject({ status: "working" });
        // The child is taught the native tools it can actually call.
        const prompt = (await ctx.fns.session.getMessages({ id: out.id })).map((m: any) => String(m.content)).join("\n");
        expect(prompt).toContain("todo_done tool");
        expect(prompt).toContain("finish_task tool");
    });

    test("a goal-bound parent goes through the same goal delegation path", async () => {
        const { ctx, call, agent } = await setup();
        const seen: any[] = [];
        ctx.state.registry.goal.delegationCapture = async () => ({ goalId: "g" });
        ctx.state.registry.agent.publishGoalDelegation = async (_c: any, _s: any, opts: any) => { seen.push(opts); return { id: "goal-child" }; };
        const out = JSON.parse((await call("delegate_task", { title: "x", tasks: [{ id: "a", title: "A" }] })).output);
        expect(out).toEqual({ id: "goal-child", status: "working" });
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ parent: { id: agent.id }, title: "x", tasks: [{ id: "a", title: "A" }] });
    });

    test("an invalid task list creates no child", async () => {
        const { ctx, call, agent } = await setup();
        const result = await call("delegate_task", { title: "x", tasks: [{ id: "a", title: "A" }, { id: "a", title: "B" }] });
        expect(result.isError).toBe(true);
        expect(await ctx.fns.agent.team({ agent })).toHaveLength(0);
    });

    test("a wider presetId cannot widen the parent's preset", async () => {
        const { ctx, call } = await setup(snapshot(["tools.*", "agent.*", "session.*"], ["tools.bash"]));
        const out = JSON.parse((await call("delegate_task", { title: "x", presetId: "creator", tasks: [{ id: "a", title: "A" }] })).output);
        const child = ctx.state.agent[out.id];
        const allows = ctx.fns.agentPreset.predicate({ snapshot: child.preset });
        expect(allows("tools.bash")).toBe(false);
        expect(allows("procs.db.select")).toBe(false);
        expect(ctx.fns.agent.wireTools({ agent: child }).map((t: any) => t.name)).not.toContain("bash");
    });

    test("finish_task: unfinished todos fail, completion delivers once, repeats do not redeliver", async () => {
        const { ctx, call, agent } = await setup();
        const { id } = JSON.parse((await call("delegate_task", { title: "x", tasks: [{ id: "a", title: "A" }, { id: "b", title: "B" }] })).output);
        const child = ctx.state.agent[id];
        const parentUpdates = async () => (await ctx.fns.procs.db.select({ sql: "SELECT payload FROM session_inbound_deliveries WHERE agent_id = ?", params: [agent.id] }))
            .filter((r: any) => String(typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload)).includes("todos.completed")).length
            + (await ctx.fns.session.getMessages({ id: agent.id, includeExcluded: true })).filter((m: any) => String(m.content).includes("todos.completed")).length;
        const early = await call("finish_task", { summary: "s", result: { count: 1 } }, child);
        expect(early.isError).toBe(true);
        expect(early.output).toMatch(/fully completed/);
        expect(await parentUpdates()).toBe(0);
        await call("todo_done", { id: "a" }, child);
        await call("todo_done", { id: "b" }, child);
        for (const result of [null, "{\"count\": 7}", 7, [7]]) {
            const rejected = await call("finish_task", { summary: "s", result }, child);
            expect(rejected.isError).toBe(true);
            expect(rejected.output).toMatch(/must be an object|missing required|must be a JSON object/);
        }
        expect(await parentUpdates()).toBe(0);
        // The adapter re-checks the shape when called directly with a trusted session.
        const direct = ctx.fns.session.forAgent({ agent: child });
        await expect(ctx.state.registry.tools.finishTask(ctx, direct, { summary: "s", result: "{\"count\": 7}" })).rejects.toThrow("must be a JSON object");
        const done = await call("finish_task", { summary: "Counted", result: { count: 7 } }, child);
        expect(done.isError).toBe(false);
        expect(JSON.parse(done.output)).toMatchObject({ ok: true, alreadyFinished: false, parentId: agent.id });
        const delivered = await parentUpdates();
        expect(delivered).toBeGreaterThan(0);
        const meta = (await ctx.fns.session.load({ id })).scratchpad.delegation;
        expect(meta).toMatchObject({ status: "ready", result: { result: { count: 7 }, summary: "Counted" } });
        expect(JSON.parse((await call("finish_task", { summary: "again", result: { count: 9 } }, child)).output)).toMatchObject({ alreadyFinished: true });
        expect(await parentUpdates()).toBe(delivered);
        expect((await ctx.fns.session.load({ id })).scratchpad.delegation.result.result).toEqual({ count: 7 });
        const members = await ctx.fns.agent.team({ agent });
        expect(members.find((m: any) => m.id === id)).toMatchObject({ status: "ready" });
    });

    test("finish_task is absent and rejected for an agent that was not delegated", async () => {
        const { ctx, call, agent, stored } = await setup();
        expect(ctx.fns.agent.wireTools({ agent }).map((t: any) => t.name)).not.toContain("finish_task");
        const result = await call("finish_task", { summary: "s", result: { value: 1 } });
        expect(result.isError).toBe(true);
        expect(result.output).toMatch(/unknown tool "finish_task"/);
        expect(result.handlerExecuted).toBe(false);
        // A plain fork carries no delegation metadata either.
        const fork = await ctx.fns.session.fork({ id: agent.id, title: "fork" });
        fork.preset = agent.preset;
        expect(ctx.fns.agent.wireTools({ agent: fork }).map((t: any) => t.name)).not.toContain("finish_task");
        await expect(ctx.fns.tools.finishTask({ summary: "s", result: { value: 1 } })).rejects.toThrow("trusted agent invocation");
        expect((await stored()).delegation).toBeUndefined();
    });
});

describe("binding and gating", () => {
    test("rejects agent selectors and unknown arguments in all four tools; nothing changes", async () => {
        const { ctx, call, agent, stored } = await setup();
        await call("todo_update", { tasks: [{ id: "a", title: "A" }] });
        const { id } = JSON.parse((await call("delegate_task", { title: "x", tasks: [{ id: "a", title: "A" }] })).output);
        const child = ctx.state.agent[id];
        const before = JSON.stringify((await stored()).todos);
        const valid: Record<string, any> = { todo_update: { tasks: [{ id: "a", title: "A" }, { id: "z", title: "Z" }] }, todo_done: { id: "a" }, delegate_task: { title: "y", tasks: [{ id: "a", title: "A" }] }, finish_task: { summary: "s", result: { value: 1 } } };
        for (const name of NAMES) for (const extra of [{ agent: "x" }, { agentId: child.id }, { parentId: "x" }, { owner: "x" }]) {
            const result = await call(name, { ...valid[name], ...extra }, name === "finish_task" ? child : agent);
            expect(result.isError).toBe(true);
            expect(result.output).toMatch(/invalid arguments|unknown argument/);
            expect(result.handlerExecuted).toBe(false);
        }
        expect(JSON.stringify((await stored()).todos)).toBe(before);
        expect(await ctx.fns.agent.team({ agent })).toHaveLength(1);
        // Direct calls without a trusted invocation fail instead of falling back to a current agent.
        await expect(ctx.fns.tools.todoUpdate({ tasks: [{ id: "a", title: "A" }] })).rejects.toThrow("trusted agent invocation");
        await expect(ctx.fns.tools.todoDone({ id: "a" })).rejects.toThrow("trusted agent invocation");
        await expect(ctx.fns.tools.delegateTask({ title: "x", tasks: [{ id: "a", title: "A" }] })).rejects.toThrow("trusted agent invocation");
        // Adapter-level selectors are rejected even when called directly with a session.
        await expect(ctx.fns.tools.todoDone({ id: "a", agent } as any)).rejects.toThrow("unknown argument agent");
    });

    test("denying an adapter removes the tool while the runtime function stays reachable", async () => {
        const preset = snapshot(["*"], ["tools.todoUpdate", "tools.delegateTask"]);
        const { ctx, call, agent, stored } = await setup(preset);
        const names = ctx.fns.agent.wireTools({ agent }).map((t: any) => t.name);
        expect(names).not.toContain("todo_update");
        expect(names).not.toContain("delegate_task");
        expect(names).toContain("todo_done");
        expect((await call("todo_update", { tasks: [{ id: "a", title: "A" }] })).output).toMatch(/unknown tool "todo_update"/);
        const allows = ctx.fns.agentPreset.predicate({ snapshot: preset });
        expect(allows("todo.create")).toBe(true);
        await ctx.fns.todo.create({ agent, tasks: [{ id: "a", title: "A" }] });
        expect(states((await stored()).todos)).toEqual(["a:active"]);
        // And denying the wrapped capability removes the tool even when the adapter is allowed.
        const { ctx: c2, agent: a2 } = await setup(snapshot(["*"], ["todo.done", "agent.delegate"]));
        const visible = c2.fns.agent.wireTools({ agent: a2 }).map((t: any) => t.name);
        expect(visible).not.toContain("todo_done");
        expect(visible).not.toContain("delegate_task");
        expect(visible).toContain("todo_update");
    });

    test("the retired plan tools fail as unknown tools that list todo_update", async () => {
        const { call } = await setup();
        for (const name of ["plan_update", "plan_done"]) {
            const result = await call(name, { tasks: [{ id: "a", title: "A" }], id: "a" });
            expect(result.isError).toBe(true);
            expect(result.output).toMatch(new RegExp(`unknown tool "${name}"`));
            expect(result.output).toContain("todo_update");
            expect(result.output).toContain("todo_done");
        }
    });

    test("prompt guidance names the native tools only when the agent can call them", async () => {
        const { ctx, agent } = await setup(snapshot(["*"]));
        const full = await ctx.fns.agent.fullSystemPrompt({ agent });
        expect(full).toContain("todo_update tool");
        expect(full).toContain("delegate_task tool");
        agent.preset = snapshot(["*"], ["tools.todoUpdate", "tools.delegateTask"]);
        const narrowed = await ctx.fns.agent.fullSystemPrompt({ agent });
        expect(narrowed).not.toContain("todo_update tool");
        expect(narrowed).not.toContain("delegate_task tool");
        expect(narrowed).toContain("ctx.fns.todo.create");
    });

    test("schemas are strict objects without agent selectors and survive every provider adapter", async () => {
        const { ctx } = await setup();
        const p = ctx.fns.models.protocol;
        const parent = await ctx.fns.agent.start({ model: "test:model", systemPrompt: "" });
        const child = { ...parent, parentId: "p", scratchpad: { delegation: { parentId: "p", status: "working" } }, preset: snapshot(["*"]) };
        const wire = ctx.fns.agent.wireTools({ agent: child }).filter((t: any) => NAMES.includes(t.name));
        expect(wire.map((t: any) => t.name).sort()).toEqual([...NAMES].sort());
        for (const spec of wire) {
            expect(spec.parameters).toMatchObject({ type: "object", additionalProperties: false });
            expect(JSON.stringify(spec.parameters)).not.toMatch(/"(agent|agentId|parentId|owner|session|preset)"/);
            expect(p.anthropic.toTools({ tools: [spec] })).toEqual([{ name: spec.name, description: spec.description, input_schema: spec.parameters }]);
            expect(p.gemini.toTools({ tools: [spec] })).toEqual([{ functionDeclarations: [{ name: spec.name, description: spec.description, parameters: spec.parameters }] }]);
            expect(p.openaiChat.toTools({ tools: [spec] })[0].function.parameters).toEqual(spec.parameters);
            expect(spec.description.length).toBeLessThan(600);
        }
    });
});
