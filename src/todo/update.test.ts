import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

describe("todo.update", () => {
    test("edits fields, adds, removes and reorders pending tasks while preserving state", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, title: "Old", tasks: [
            { id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" },
        ] });
        const startedAt = agent.scratchpad.todos.tasks[0].startedAt;
        const result = await ctx.fns.todo.update({ agent, title: "New", tasks: [
            { id: "a", title: "A edited", instructions: "details" },
            { id: "d", title: "D" },
            { id: "b", title: "B edited" },
        ] });
        expect(result.todos.title).toBe("New");
        expect(result.todos.tasks.map((task: any) => task.id)).toEqual(["a", "d", "b"]);
        expect(result.todos.tasks[0]).toMatchObject({ status: "active", startedAt, title: "A edited", instructions: "details" });
        expect(result.todos.tasks[1]).toMatchObject({ status: "pending", elapsedMs: 0 });
        expect(result.active).toEqual(["a"]);
    });

    test("activates the first added task when extending a completed list", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, tasks: [{ id: "a", title: "A" }] });
        await ctx.fns.todo.done({ agent, id: "a" });
        const result = await ctx.fns.todo.update({ agent, tasks: [
            { id: "a", title: "A" }, { id: "b", title: "B", instructions: "Do B" },
        ] });
        expect(result.todos.tasks[1]).toMatchObject({ id: "b", status: "active" });
        expect(result.todos.tasks[1].activeSince).toBeNumber();
    });


    test("rejects removal or reordering of active and done tasks", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, tasks: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] });
        await ctx.fns.todo.done({ agent, id: "a" });
        expect(ctx.fns.todo.update({ agent, tasks: [{ id: "b", title: "B" }, { id: "c", title: "C" }] })).rejects.toThrow("cannot be removed");
        expect(ctx.fns.todo.update({ agent, tasks: [{ id: "b", title: "B" }, { id: "a", title: "A" }, { id: "c", title: "C" }] })).rejects.toThrow("cannot be reordered");
    });

    test("rejects duplicate IDs and new tasks before fixed history", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, tasks: [{ id: "a", title: "A" }] });
        expect(ctx.fns.todo.update({ agent, tasks: [{ id: "a", title: "A" }, { id: "a", title: "Again" }] })).rejects.toThrow("duplicate todo id");
        expect(ctx.fns.todo.update({ agent, tasks: [{ id: "new", title: "New" }, { id: "a", title: "A" }] })).rejects.toThrow("pending todos must follow");
    });

    test("starts a pending or new todo in parallel and keeps the order rule", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, tasks: [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }] });
        const started = await ctx.fns.todo.update({ agent, tasks: [
            { id: "a", title: "A", status: "active" }, { id: "b", title: "B", status: "active" }, { id: "n", title: "New", status: "active" }, { id: "c", title: "C" },
        ] });
        expect(started.active).toEqual(["a", "b", "n"]);
        expect(started.todos.tasks.filter((task: any) => task.status === "active").every((task: any) => task.activeSince > 0)).toBe(true);
        const before = JSON.stringify((await ctx.fns.session.load({ id: agent.id })).scratchpad.todos);
        await expect(ctx.fns.todo.update({ agent, tasks: [
            { id: "a", title: "A" }, { id: "b", title: "B" }, { id: "n", title: "New" }, { id: "x", title: "X" }, { id: "c", title: "C", status: "active" },
        ] })).rejects.toThrow("pending todos must follow");
        await expect(ctx.fns.todo.update({ agent, tasks: [
            { id: "a", title: "A", status: "pending" as any }, { id: "b", title: "B" }, { id: "n", title: "New" }, { id: "c", title: "C" },
        ] })).rejects.toThrow("invalid status");
        await ctx.fns.todo.done({ agent, id: "a" });
        await expect(ctx.fns.todo.update({ agent, tasks: [
            { id: "a", title: "A", status: "active" }, { id: "b", title: "B" }, { id: "n", title: "New" }, { id: "c", title: "C" },
        ] })).rejects.toThrow("cannot be started again");
        const stored = (await ctx.fns.session.load({ id: agent.id })).scratchpad.todos;
        expect(JSON.parse(before).tasks.map((task: any) => task.id)).toEqual(stored.tasks.map((task: any) => task.id));
        expect(stored.tasks.map((task: any) => task.status)).toEqual(["done", "active", "active", "pending"]);
    });

    test("pause and resume settle and restart every active todo idempotently", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, tasks: [{ id: "a", title: "A" }, { id: "b", title: "B", status: "active" }, { id: "c", title: "C" }] });
        await new Promise(resolve => setTimeout(resolve, 5));
        const paused = await ctx.fns.todo.pause({ agent });
        expect(paused.changed).toBe(true);
        const todos = agent.scratchpad.todos;
        expect(todos.pausedAt).toBeNumber();
        expect(todos.tasks.slice(0, 2).map((task: any) => [task.activeSince, task.elapsedMs > 0])).toEqual([[null, true], [null, true]]);
        expect((await ctx.fns.todo.pause({ agent })).changed).toBe(false);
        const resumed = await ctx.fns.todo.resume({ id: agent.id });
        expect(resumed.changed).toBe(true);
        expect(agent.scratchpad.todos.pausedAt).toBeNull();
        expect(agent.scratchpad.todos.tasks.map((task: any) => !!task.activeSince)).toEqual([true, true, false]);
        expect((await ctx.fns.todo.resume({ agent })).changed).toBe(false);
        expect((await ctx.fns.todo.pause({ id: "missing-free" }).catch((error: any) => String(error.message)))).toContain("not found");
    });
});
