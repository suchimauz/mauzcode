import { describe, expect, test } from "bun:test";
import { mkTestCtx } from "../_testCtx.entry";

async function poll(ctx: any, now: number) {
  const pending: Promise<any>[] = [];
  const original = ctx.fns.agent.processTrigger;
  ctx.fns.agent.processTrigger = (_c: any, _s: any, opts: any) => { const work = original(opts); pending.push(work); return work; };
  try { await ctx.fns.agent.pollTriggers({ now }); await Promise.all(pending); }
  finally { ctx.fns.agent.processTrigger = (_c: any, _s: any, opts: any) => original(opts); }
}
const lifecycle = async (ctx: any, id: string) => (await ctx.fns.session.getEvents({ id })).filter((e: any) => e.type === 'trigger_lifecycle');

describe("chat trigger projection", () => {
  test("lists every armed trigger nearest first, counts by kind and hides predicate data", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const now = Date.now();
    // 101 finished triggers newer than the armed one: the panel is not capped by the audit window.
    const old = await ctx.fns.agent.wake({ id: agent.id, inMs: 3_600_000, prompt: "  Old   armed\nsecond line" });
    for (let i = 0; i < 101; i++) await ctx.fns.procs.db.run({ sql: "INSERT INTO agent_triggers(id,agent_id,kind,prompt,status,created_at,updated_at) VALUES(?,?,'at','done','completed',?,?)", params: [`tr_done_${i}`, agent.id, now + 1000 + i, now] });
    await ctx.fns.agent.cron({ id: agent.id, expression: "0 9 * * *", timezone: "Europe/Lisbon", prompt: "x".repeat(200) });
    await ctx.fns.procs.db.run({ sql: "INSERT INTO agent_triggers(id,agent_id,kind,prompt,config,mode,status,next_at,created_at,updated_at) VALUES('tr_watch',?,'watch','Build green',?::jsonb,'edge','checking',?,?,?)", params: [agent.id, JSON.stringify({ predicate: 'db.rows', opts: { sql: 'SELECT secret' } }), now + 1000, now, now] });
    const { counts, triggers } = await ctx.fns.agent.armedTriggers({ id: agent.id });
    expect(counts).toEqual({ at: 1, cron: 1, watch: 1 });
    expect(triggers).toHaveLength(3);
    expect(triggers[0]).toMatchObject({ id: 'tr_watch', status: 'checking', mode: 'edge', purpose: 'Build green' });
    expect(triggers.find((t: any) => t.id === old.id)).toMatchObject({ purpose: 'Old armed' });
    const cron = triggers.find((t: any) => t.kind === 'cron');
    expect(cron).toMatchObject({ cronExpression: '0 9 * * *', timezone: 'Europe/Lisbon' });
    expect([...cron.purpose].length).toBe(120); expect(cron.purpose.endsWith('…')).toBe(true);
    expect(JSON.stringify(triggers)).not.toContain('SELECT secret');
    for (let i = 1; i < triggers.length; i++) expect(Number(triggers[i].nextAt)).toBeGreaterThanOrEqual(Number(triggers[i - 1].nextAt));
  });
});

describe("shared trigger operations", () => {
  test("run now returns explicit outcomes and never fires directly", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const made = await ctx.fns.agent.wake({ id: agent.id, inMs: 3_600_000, prompt: "Later" });
    expect((await ctx.fns.agent.runTriggerNow({ id: agent.id, triggerId: made.id })).outcome).toBe('scheduled');
    expect((await ctx.fns.session.getMessages({ id: agent.id })).some((m: any) => m.content === 'Later')).toBe(false);
    await ctx.fns.procs.db.run({ sql: "UPDATE agent_triggers SET status='checking' WHERE id=?", params: [made.id] });
    expect((await ctx.fns.agent.runTriggerNow({ id: agent.id, triggerId: made.id })).outcome).toBe('already_checking');
    await ctx.fns.procs.db.run({ sql: "UPDATE agent_triggers SET status='completed' WHERE id=?", params: [made.id] });
    expect((await ctx.fns.agent.runTriggerNow({ id: agent.id, triggerId: made.id })).outcome).toBe('not_active');
    const other = await ctx.fns.agent.start({ model: "mock:test" });
    const foreign = await ctx.fns.agent.wake({ id: other.id, inMs: 3_600_000, prompt: "Theirs" });
    expect((await ctx.fns.agent.runTriggerNow({ id: agent.id, triggerId: foreign.id })).outcome).toBe('not_active');
    const paused = await ctx.fns.agent.wake({ id: agent.id, inMs: 3_600_000, prompt: "Paused" });
    await ctx.fns.procs.db.run({ sql: "UPDATE agents SET stopped_at=? WHERE id=?", params: [Date.now(), agent.id] });
    expect((await ctx.fns.agent.runTriggerNow({ id: agent.id, triggerId: paused.id })).outcome).toBe('deferred_paused');
  });

  test("check now on a false watch checks once without firing", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const made = await ctx.fns.agent.watch({ id: agent.id, predicate: "file.exists", opts: { path: `.mauzcode/tmp/none-${crypto.randomUUID()}` }, prompt: "Ready", everyMs: 3_600_000 });
    await poll(ctx, Date.now());
    expect((await ctx.fns.agent.runTriggerNow({ id: agent.id, triggerId: made.id })).outcome).toBe('scheduled');
    await poll(ctx, Date.now() + 10);
    expect((await ctx.fns.session.getMessages({ id: agent.id })).some((m: any) => m.message_type === 'trigger')).toBe(false);
    expect((await ctx.fns.agent.armedTriggers({ id: agent.id })).counts.watch).toBe(1);
  });

  test("row action receipts replay, conflict and keep one state change", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const made = await ctx.fns.agent.wake({ id: agent.id, inMs: 3_600_000, prompt: "Report" });
    const first = await ctx.fns.agent.triggerAction({ agentId: agent.id, triggerId: made.id, action: 'cancel', requestId: 'k1' });
    expect(first).toMatchObject({ ok: true, outcome: 'cancelled', kind: 'at', purpose: 'Report' });
    const again = await ctx.fns.agent.triggerAction({ agentId: agent.id, triggerId: made.id, action: 'cancel', requestId: 'k1' });
    expect(again).toMatchObject({ outcome: 'cancelled', duplicate: true, at: first.at });
    await expect(ctx.fns.agent.triggerAction({ agentId: agent.id, triggerId: made.id, action: 'run', requestId: 'k1' })).rejects.toThrow('reused');
    expect((await lifecycle(ctx, agent.id)).filter((e: any) => e.transition === 'cancelled')).toHaveLength(1);
    const stale = await ctx.fns.agent.triggerAction({ agentId: agent.id, triggerId: made.id, action: 'cancel', requestId: 'k2' });
    expect(stale).toMatchObject({ ok: false, outcome: 'not_active' });
    expect((await lifecycle(ctx, agent.id)).filter((e: any) => e.transition === 'cancelled')).toHaveLength(1);
  });

  test("a fired cron replays its stored run result", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const made = await ctx.fns.agent.cron({ id: agent.id, expression: "0 9 * * *", timezone: "UTC", prompt: "Daily" });
    const first = await ctx.fns.agent.triggerAction({ agentId: agent.id, triggerId: made.id, action: 'run', requestId: 'r1' });
    expect(first.outcome).toBe('scheduled');
    await poll(ctx, Date.now() + 10);
    const replay = await ctx.fns.agent.triggerAction({ agentId: agent.id, triggerId: made.id, action: 'run', requestId: 'r1' });
    expect(replay).toMatchObject({ outcome: 'scheduled', duplicate: true });
    const runs = await ctx.fns.procs.db.select({ sql: "SELECT outcome FROM agent_trigger_runs WHERE trigger_id=?", params: [made.id] });
    expect(runs.filter((r: any) => r.outcome === 'fired')).toHaveLength(1);
  });

  test("planning mode blocks mutation without touching mode or review", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const made = await ctx.fns.agent.wake({ id: agent.id, inMs: 3_600_000, prompt: "Plan safe" });
    await ctx.fns.procs.db.run({ sql: "INSERT INTO agent_planning(agent_id,mode,revision,proposal,updated_at) VALUES (?,'plan',3,'{\"status\":\"pending\",\"id\":\"p\"}'::jsonb,?)", params: [agent.id, Date.now()] });
    const result = await ctx.fns.agent.triggerAction({ agentId: agent.id, triggerId: made.id, action: 'cancel', requestId: 'p1' });
    expect(result).toMatchObject({ ok: false, outcome: 'planning' });
    expect((await ctx.fns.agent.armedTriggers({ id: agent.id })).counts.at).toBe(1);
    const [planning] = await ctx.fns.procs.db.select({ sql: "SELECT mode,revision,proposal->>'status' AS status FROM agent_planning WHERE agent_id=?", params: [agent.id] });
    expect(planning).toEqual({ mode: 'plan', revision: 3, status: 'pending' });
  });

  test("cancellation racing delivery reports the committed outcome", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const made = await ctx.fns.agent.wake({ id: agent.id, inMs: 1000, prompt: "Race" });
    await poll(ctx, made.nextAt + 1);
    const result = await ctx.fns.agent.triggerAction({ agentId: agent.id, triggerId: made.id, action: 'cancel', requestId: 'race' });
    expect(result.outcome).toBe('not_active');
    expect((await lifecycle(ctx, agent.id)).filter((e: any) => e.transition === 'cancelled')).toHaveLength(0);
  });
});

describe("durable lifecycle entries", () => {
  test("creation records the creator; visible tool calls skip the entry, foreign creation names the creator", async () => {
    const ctx: any = await mkTestCtx();
    const owner = await ctx.fns.agent.start({ model: "mock:test" });
    const other = await ctx.fns.agent.start({ model: "mock:test" });
    await ctx.fns.agent.wake({ id: owner.id, inMs: 60_000, prompt: "Form made" });
    let entries = await lifecycle(ctx, owner.id);
    expect(entries).toHaveLength(1); expect(entries[0]).toMatchObject({ transition: 'created', triggerKind: 'at', purpose: 'Form made' });
    const own = await ctx.fns.agent.toolCallScope({ action: 'with', binding: { agentId: owner.id, toolCallId: 'call_1' }, fn: () => ctx.fns.agent.wake({ id: owner.id, inMs: 60_000, prompt: "Own" }) });
    expect(await lifecycle(ctx, owner.id)).toHaveLength(1);
    const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT created_by_agent_id,created_by_tool_call_id FROM agent_triggers WHERE id=?', params: [own.id] });
    expect(row).toEqual({ created_by_agent_id: owner.id, created_by_tool_call_id: 'call_1' });
    await ctx.fns.agent.toolCallScope({ action: 'with', binding: { agentId: other.id, toolCallId: 'call_2' }, fn: () => ctx.fns.agent.wake({ id: owner.id, inMs: 60_000, prompt: "From peer" }) });
    entries = await lifecycle(ctx, owner.id);
    expect(entries).toHaveLength(2); expect(entries[1]).toMatchObject({ transition: 'created', creatorAgentId: other.id });
    expect(await ctx.fns.session.getMessages({ id: owner.id })).toHaveLength(0);
  });

  test("planning blocks an agent arming its own trigger and rolls back", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    await ctx.fns.procs.db.run({ sql: "INSERT INTO agent_planning(agent_id,mode,revision,updated_at) VALUES (?,'plan',1,?)", params: [agent.id, Date.now()] });
    await expect(ctx.fns.agent.toolCallScope({ action: 'with', binding: { agentId: agent.id, toolCallId: 'c' }, fn: () => ctx.fns.agent.wake({ id: agent.id, inMs: 60_000, prompt: "No" }) })).rejects.toThrow('Planning');
    expect((await ctx.fns.agent.armedTriggers({ id: agent.id })).triggers).toHaveLength(0);
    expect(await lifecycle(ctx, agent.id)).toHaveLength(0);
  });

  test("silent watch expiry adds one entry; delivered timeout uses wake_up only", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const path = `.mauzcode/tmp/none-${crypto.randomUUID()}`;
    const silent = await ctx.fns.agent.watch({ id: agent.id, predicate: "file.exists", opts: { path }, prompt: "Silent", everyMs: 5000, timeoutMs: 5000 });
    const loud = await ctx.fns.agent.watch({ id: agent.id, predicate: "file.exists", opts: { path }, prompt: "Loud", everyMs: 5000, timeoutMs: 5000, onTimeoutPrompt: "Gave up" });
    await poll(ctx, Math.max(silent.timeoutAt, loud.timeoutAt) + 1);
    const entries = await lifecycle(ctx, agent.id);
    const expiries = entries.filter((e: any) => e.transition === 'expired');
    expect(expiries.map((e: any) => e.triggerId)).toEqual([silent.id]);
    const wakes = (await ctx.fns.session.getEvents({ id: agent.id })).filter((e: any) => e.type === 'wake_up');
    expect(wakes.map((e: any) => e.triggerId)).toEqual([loud.id]);
    await poll(ctx, Math.max(silent.timeoutAt, loud.timeoutAt) + 60_000);
    expect((await lifecycle(ctx, agent.id)).filter((e: any) => e.transition === 'expired')).toHaveLength(1);
  });

  test("an edge watch timeout coalesced behind a pending firing adds one expiry and no wake", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const made = await ctx.fns.agent.watch({ id: agent.id, predicate: "file.exists", opts: { path: `.mauzcode/tmp/none-${crypto.randomUUID()}` }, prompt: "Edge", everyMs: 5000, timeoutMs: 5000, mode: 'edge', onTimeoutPrompt: "Timed out" });
    await ctx.fns.procs.db.run({ sql: "INSERT INTO agent_trigger_deliveries(trigger_id,firing_key,agent_id,message_idx,state,created_at) VALUES(?,1,?,999,'pending',?)", params: [made.id, agent.id, Date.now()] });
    await poll(ctx, made.timeoutAt + 1);
    expect((await lifecycle(ctx, agent.id)).filter((e: any) => e.transition === 'expired')).toHaveLength(1);
    expect((await ctx.fns.session.getEvents({ id: agent.id })).filter((e: any) => e.type === 'wake_up')).toHaveLength(0);
    expect((await ctx.fns.session.getMessages({ id: agent.id })).some((m: any) => m.message_type === 'trigger')).toBe(false);
  });

  test("bulk cancellation adds one entry per changed trigger", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    await ctx.fns.agent.wake({ id: agent.id, inMs: 60_000, prompt: "A" });
    await ctx.fns.agent.cron({ id: agent.id, expression: "0 9 * * *", timezone: "UTC", prompt: "B" });
    expect((await ctx.fns.agent.cancelAllTriggers({ id: agent.id })).cancelled).toBe(2);
    expect((await lifecycle(ctx, agent.id)).filter((e: any) => e.transition === 'cancelled' && e.cause === 'bulk')).toHaveLength(2);
    expect((await ctx.fns.agent.cancelAllTriggers({ id: agent.id })).cancelled).toBe(0);
    expect((await lifecycle(ctx, agent.id)).filter((e: any) => e.transition === 'cancelled')).toHaveLength(2);
  });

  test("a rolled-back transition leaves no entry", async () => {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: "mock:test" });
    const made = await ctx.fns.agent.wake({ id: agent.id, inMs: 60_000, prompt: "Keep" });
    await expect(ctx.fns.procs.db.transaction({ fn: async () => { await ctx.fns.agent.cancelTrigger({ id: agent.id, triggerId: made.id }); throw new Error('boom'); } })).rejects.toThrow('boom');
    expect((await lifecycle(ctx, agent.id)).filter((e: any) => e.transition === 'cancelled')).toHaveLength(0);
    expect((await ctx.fns.agent.armedTriggers({ id: agent.id })).counts.at).toBe(1);
  });
});
