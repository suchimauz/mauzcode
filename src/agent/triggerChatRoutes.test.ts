import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';
import listRoute from './$route_$id_triggers_GET';
import actionRoute from './$route_$id_triggers_$triggerId_actions_POST';
import formRoute from './$route_$id_triggers_POST';
import eventsRoute from '../api/$route_v1_agents_$id_events_GET';

// Real DB and operations; only the cookie identity and CSRF verifier are stubbed.
async function setup() {
    const ctx: any = await mkTestCtx();
    const agent = await ctx.fns.agent.start({ model: 'mock:test' });
    await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET created_by=? WHERE id=?', params: ['u', agent.id] });
    const who: any = { required: true, user: { id: 'u', disabledAt: null } };
    ctx.state.registry.auth.currentUser = async () => who;
    ctx.state.registry.auth.verifyCsrf = async (_c: any, _s: any, { token }: any) => token === 'good';
    const call = (route: any, req: Request, params: Record<string, string>) => route(ctx, null, { req, params });
    const post = (triggerId: string, body: unknown, token = 'good') => call(actionRoute, new Request(`http://local/agent/${agent.id}/triggers/${triggerId}/actions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-csrf-token': token } : {}) }, body: JSON.stringify(body) }), { id: agent.id, triggerId });
    return { ctx, agent, who, call, post };
}

test('panel GET returns the owner projection and denies other owners without data', async () => {
    const { ctx, agent, who, call } = await setup();
    // Inserted directly: no network predicate is evaluated in this test.
    await ctx.fns.procs.db.run({ sql: "INSERT INTO agent_triggers(id,agent_id,kind,prompt,config,status,next_at,created_at,updated_at) VALUES('tr_w',?,'watch','Deploy ready',?::jsonb,'active',5,1,1)", params: [agent.id, JSON.stringify({ predicate: 'http.ok', opts: { url: 'http://x/secret-token' } })] });
    const made = { id: 'tr_w' };
    const ok = await call(listRoute, new Request(`http://local/agent/${agent.id}/triggers`), { id: agent.id });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body).toMatchObject({ agentId: agent.id, counts: { watch: 1 }, triggers: [{ id: made.id, purpose: 'Deploy ready' }] });
    expect(JSON.stringify(body)).not.toContain('secret-token');
    who.user = { id: 'other', disabledAt: null };
    const denied = await call(listRoute, new Request(`http://local/agent/${agent.id}/triggers`), { id: agent.id });
    expect(denied.status).toBe(403);
    expect(JSON.stringify(await denied.json())).not.toContain('Deploy');
});

test('row actions require CSRF, reject foreign IDs safely and replay by request key', async () => {
    const { ctx, agent, post } = await setup();
    const made = await ctx.fns.agent.wake({ id: agent.id, inMs: 3_600_000, prompt: 'Mine' });
    expect((await post(made.id, { requestId: 'a', action: 'cancel' }, '')).status).toBe(403);
    expect((await post(made.id, { requestId: 'a', action: 'cancel' }, 'bad')).status).toBe(403);
    expect((await ctx.fns.agent.armedTriggers({ id: agent.id })).counts.at).toBe(1);
    const other = await ctx.fns.agent.start({ model: 'mock:test' });
    const theirs = await ctx.fns.agent.wake({ id: other.id, inMs: 3_600_000, prompt: 'Their secret purpose' });
    const foreign = await post(theirs.id, { requestId: 'f', action: 'cancel' });
    const foreignBody = await foreign.json();
    expect(foreignBody).toMatchObject({ ok: false, outcome: 'not_active' });
    expect(JSON.stringify(foreignBody)).not.toContain('Their secret');
    expect((await ctx.fns.agent.armedTriggers({ id: other.id })).counts.at).toBe(1);
    const run = await (await post(made.id, { requestId: 'r', action: 'run' })).json();
    expect(run).toMatchObject({ ok: true, outcome: 'scheduled' });
    expect(await (await post(made.id, { requestId: 'r', action: 'run' })).json()).toMatchObject({ duplicate: true, outcome: 'scheduled' });
    expect((await post(made.id, { requestId: 'r', action: 'cancel' })).status).toBe(409);
    expect((await post(made.id, { requestId: 'x', action: 'explode' })).status).toBe(400);
});

test('inspector form route requires CSRF and routes run through the shared operation', async () => {
    const { ctx, agent, call } = await setup();
    const made = await ctx.fns.agent.wake({ id: agent.id, inMs: 3_600_000, prompt: 'Form run' });
    const form = (fields: Record<string, string>, header?: string) => { const data = new FormData(); for (const [k, v] of Object.entries(fields)) data.set(k, v); return new Request(`http://local/agent/${agent.id}/triggers`, { method: 'POST', body: data, headers: header ? { 'x-csrf-token': header } : {} }); };
    expect((await call(formRoute, form({ action: 'cancel', triggerId: made.id }), { id: agent.id })).status).toBe(403);
    expect((await call(formRoute, form({ action: 'cancel', triggerId: made.id, csrf: 'bad' }), { id: agent.id })).status).toBe(403);
    expect((await ctx.fns.agent.armedTriggers({ id: agent.id })).counts.at).toBe(1);
    expect((await call(formRoute, form({ action: 'run', triggerId: made.id }, 'good'), { id: agent.id })).status).toBe(204);
    const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT next_at FROM agent_triggers WHERE id=?', params: [made.id] });
    expect(Number(row.next_at)).toBeLessThanOrEqual(Date.now());
    expect((await call(formRoute, form({ action: 'cancel', triggerId: made.id, csrf: 'good' }), { id: agent.id })).status).toBe(204);
    expect((await ctx.fns.agent.armedTriggers({ id: agent.id })).counts.at).toBe(0);
});

test('events API projects lifecycle entries and badges the creating tool card', async () => {
    const { ctx, agent } = await setup();
    const created = await ctx.fns.agent.toolCallScope({ action: 'with', binding: { agentId: agent.id, toolCallId: 'call_x' }, fn: () => ctx.fns.agent.wake({ id: agent.id, inMs: 60_000, prompt: 'Badge me' }) });
    await ctx.fns.session.appendEvent({ id: agent.id, event: { type: 'tool_call', name: 'agent.wake', args: {}, result: 'ok', isError: false, toolCallId: 'call_x' } });
    await ctx.fns.agent.cancelTrigger({ id: agent.id, triggerId: created.id });
    const response = await eventsRoute(ctx, null, { req: new Request(`http://local/api/v1/agents/${agent.id}/events`), params: { id: agent.id } });
    const { events } = await response.json() as any;
    const card = events.find((e: any) => e.type === 'tool_call');
    expect(card.createdTriggers).toEqual([{ id: created.id, kind: 'at', ownerAgentId: agent.id }]);
    const entries = events.filter((e: any) => e.type === 'trigger_lifecycle');
    expect(entries).toHaveLength(1);
    expect(entries[0].lifecycle).toMatchObject({ transition: 'cancelled', triggerId: created.id, triggerKind: 'at', purpose: 'Badge me', cause: 'manual' });
});
