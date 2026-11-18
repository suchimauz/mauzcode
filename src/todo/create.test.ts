import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

describe("todo.create and todo.done", () => {
    test("creates todos and done advances by stable id", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        const made = await ctx.fns.todo.create({ agent, title: "Ship", tasks: [
            { id: "api", title: "API", instructions: "Implement it" },
            { id: "ui", title: "UI", instructions: "Render it" },
        ] });
        expect(made.active).toEqual(["api"]);
        expect(agent.scratchpad.todos.tasks[0].status).toBe("active");

        const result = await ctx.fns.todo.done({ agent, id: "api" });
        expect(result.next).toMatchObject({ id: "ui", instructions: "Render it" });
        expect(result.active).toEqual([{ id: "ui", title: "UI", instructions: "Render it" }]);
        expect(result.complete).toBe(false);
        expect(result.progress).toEqual({ done: 1, total: 2 });
        expect(agent.scratchpad.todos.tasks.map((t: any) => t.status)).toEqual(["done", "active"]);

        const again = await ctx.fns.todo.done({ agent, id: "api" });
        expect(again.alreadyDone).toBe(true);
        // `next` names only a todo auto-activated by this call.
        expect(again.next).toBeNull();
        expect(again.active.map((item: any) => item.id)).toEqual(["ui"]);
    });

    test("rejects duplicate ids", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        expect(ctx.fns.todo.create({ agent, tasks: [
            { id: "x", title: "One" }, { id: "x", title: "Two" },
        ] })).rejects.toThrow("duplicate todo id");
    });

    test("only an active todo can be completed", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, tasks: [
            { id: "a", title: "A" }, { id: "b", title: "B" },
        ] });
        expect(ctx.fns.todo.done({ agent, id: "b" })).rejects.toThrow('todo "b" is not active');
        const loaded = await ctx.fns.session.load({ id: agent.id });
        expect(loaded.scratchpad.todos.tasks.map((task: any) => task.status)).toEqual(["active", "pending"]);
    });

    test("preserves a concurrent scratchpad update by retrying", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, tasks: [{ id: "a", title: "A" }] });
        const originalRun = ctx.state.registry.procs.db.run;
        let injected = false;
        ctx.state.registry.procs.db.run = async (c: any, s: any, opts: any) => {
            if (!injected && String(opts.sql).includes("AND scratchpad = ?")) {
                injected = true;
                const rows = await c.fns.procs.db.select({ sql: "SELECT scratchpad FROM agents WHERE id = ?", params: [agent.id] });
                const scratchpad = JSON.parse(rows[0].scratchpad);
                scratchpad.concurrent = "kept";
                await originalRun(c, s, { sql: "UPDATE agents SET scratchpad = ? WHERE id = ?", params: [JSON.stringify(scratchpad), agent.id] });
            }
            return originalRun(c, s, opts);
        };
        await ctx.fns.todo.done({ agent, id: "a" });
        expect(agent.scratchpad.concurrent).toBe("kept");
        expect(agent.scratchpad.todos.tasks[0].status).toBe("done");
    });

    test("starts todos marked active in parallel and enforces the order rule", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        const made = await ctx.fns.todo.create({ agent, tasks: [
            { id: "a", title: "A" }, { id: "b", title: "B", status: "active" }, { id: "c", title: "C" },
        ] });
        expect(made.active).toEqual(["a", "b"]);
        expect(agent.scratchpad.todos.tasks.map((task: any) => [task.status, !!task.activeSince])).toEqual([["active", true], ["active", true], ["pending", false]]);
        await expect(ctx.fns.todo.create({ agent, tasks: [
            { id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C", status: "active" },
        ] })).rejects.toThrow("pending todos must follow active todos");
        await expect(ctx.fns.todo.create({ agent, tasks: [{ id: "a", title: "A", status: "done" as any }] })).rejects.toThrow("invalid status");
        expect(agent.scratchpad.todos.tasks.map((task: any) => task.id)).toEqual(["a", "b", "c"]);
    });

    test("done auto-activates the next todo only when none remains active", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, tasks: [
            { id: "a", title: "A" }, { id: "b", title: "B", status: "active" }, { id: "c", title: "C" },
        ] });
        const first = await ctx.fns.todo.done({ agent, id: "a" });
        expect(first.next).toBeNull();
        expect(first.active.map((item: any) => item.id)).toEqual(["b"]);
        expect(agent.scratchpad.todos.tasks[2].status).toBe("pending");
        const second = await ctx.fns.todo.done({ agent, id: "b" });
        expect(second.next).toMatchObject({ id: "c" });
        expect(second.active.map((item: any) => item.id)).toEqual(["c"]);
        const last = await ctx.fns.todo.done({ agent, id: "c" });
        expect(last).toMatchObject({ next: null, active: [], complete: true, progress: { done: 3, total: 3 } });
    });

    test("announces todo.taskDone with next and every active todo", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        const calls: any[] = [];
        const original = ctx.state.registry.procs.hooks.run;
        ctx.state.registry.procs.hooks.run = async (c: any, s: any, opts: any) => {
            if (opts.name === "todo.taskDone") calls.push(opts.opts);
            return original(c, s, opts);
        };
        await ctx.fns.todo.create({ agent, tasks: [
            { id: "a", title: "A" }, { id: "b", title: "B", status: "active" }, { id: "c", title: "C" },
        ] });
        await ctx.fns.todo.done({ agent, id: "a" });
        await ctx.fns.todo.done({ agent, id: "b" });
        await ctx.fns.todo.done({ agent, id: "b" });
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(calls.map(call => ({ taskId: call.taskId, next: call.next, active: call.active, complete: call.complete }))).toEqual([
            { taskId: "a", next: null, active: ["b"], complete: false },
            { taskId: "b", next: "c", active: ["c"], complete: false },
        ]);
    });

    test("create replaces an existing list without archiving it", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, title: "Old", tasks: [{ id: "a", title: "A" }] });
        await ctx.fns.todo.create({ agent, title: "New", tasks: [{ id: "x", title: "X" }] });
        expect(agent.scratchpad.todos.title).toBe("New");
        expect(agent.scratchpad.todos.tasks.map((task: any) => task.id)).toEqual(["x"]);
        expect(agent.scratchpad.todoHistory).toBeUndefined();
    });

    test("deferPublication requires an active transaction and an unpublished child", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await expect(ctx.fns.todo.create({ agent, deferPublication: true, tasks: [{ id: "a", title: "A" }] })).rejects.toThrow("deferred todos require");
        expect(agent.scratchpad.todos).toBeUndefined();
    });
});
