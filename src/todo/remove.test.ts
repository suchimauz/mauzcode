import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

describe("todo.remove", () => {
    test("archives the current list by default", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, title: "One", tasks: [{ id: "a", title: "A" }] });
        const result = await ctx.fns.todo.remove({ agent });
        expect(result).toEqual({ ok: true, archived: true });
        expect(agent.scratchpad.todos).toBeUndefined();
        expect(agent.scratchpad.todoHistory[0].title).toBe("One");
    });

    test("can permanently delete without history", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, tasks: [{ id: "a", title: "A" }] });
        await ctx.fns.todo.remove({ agent, archive: false });
        expect(agent.scratchpad.todos).toBeUndefined();
        expect(agent.scratchpad.todoHistory).toBeUndefined();
    });

    test("archive freezes every active todo timer", async () => {
        const ctx: any = await mkTestCtx();
        const agent = await ctx.fns.agent.start({ model: "mock:test" });
        await ctx.fns.todo.create({ agent, tasks: [{ id: "a", title: "A" }, { id: "b", title: "B", status: "active" }] });
        agent.scratchpad.todos.tasks[0].activeSince = Date.now() - 1000;
        agent.scratchpad.todos.tasks[1].activeSince = Date.now() - 1000;
        await ctx.fns.session.updateScratchpad({ id: agent.id, scratchpad: agent.scratchpad });
        await ctx.fns.todo.remove({ agent });
        const archived = agent.scratchpad.todoHistory[0].tasks[0];
        expect(archived.activeSince).toBeNull();
        expect(archived.elapsedMs).toBeGreaterThanOrEqual(900);
        expect(agent.scratchpad.todoHistory[0].tasks[1]).toMatchObject({ activeSince: null });
        expect(agent.scratchpad.todoHistory[0].tasks[1].elapsedMs).toBeGreaterThanOrEqual(900);
    });

});
