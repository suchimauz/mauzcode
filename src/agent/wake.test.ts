import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

describe("legacy wake compatibility", () => {
  test("wakeAt creates and delivers a unified trigger", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const now = Date.now();
    const scheduled = await ctx.fns.agent.wakeAt({ id: agent.id, at: now + 1000, reason: "check build" });
    expect(scheduled.reason).toBe("check build");
    const active = await ctx.fns.agent.triggers({ id: agent.id });
    expect(active[0]).toMatchObject({ kind: "at", prompt: "check build" });
    const process = ctx.state.registry.agent.processTrigger;
    const work: Promise<any>[] = [];
    ctx.state.registry.agent.processTrigger = (c: any, s: any, o: any) => {
      const delivery = process(c, s, o);
      work.push(delivery);
      return delivery;
    };
    await ctx.fns.agent.pollTriggers({ now: now + 1001 });
    expect(await Promise.all(work)).toMatchObject([{ outcome: 'fired' }]);
    const messages = await ctx.fns.session.getMessages({ id: agent.id });
    expect(messages.at(-1)).toMatchObject({ role: "user", content: "check build", message_type: "trigger" });
    expect(await ctx.fns.procs.db.select({ sql: 'SELECT author, excluded_from_cursor FROM messages WHERE agent_id = ? AND idx = ?', params: [agent.id, messages.at(-1).idx] })).toEqual([{ author: null, excluded_from_cursor: 0 }]);
  });

  test("cancelWake cancels unified one-shot alarms", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    await ctx.fns.agent.wakeIn({ id: agent.id, delayMs: 60_000, reason: "later" });
    expect((await ctx.fns.agent.cancelWake({ id: agent.id })).cancelled).toBe(true);
    expect((await ctx.fns.agent.cancelWake({ id: agent.id })).cancelled).toBe(false);
  });
});
