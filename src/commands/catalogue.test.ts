import {expect, test} from 'bun:test';
import {mkTestCtx} from '../_testCtx.entry';

test('web and both native paths negotiate the same catalogue under mobile session authentication', async () => {
    const ctx = await mkTestCtx();
    const agent = await ctx.fns.agent.start({model: 'mock:test'});
    const origin = 'http://localhost';
    const user = await ctx.fns.auth.createUser({name: 'Tester', email: 'tester@example.invalid', password: 'disposable-fixture-password'});
    const {setCookie} = await ctx.fns.auth.oidcSession({action: 'create', req: new Request(origin), userId: user.id, refreshToken: null});
    const get = (path: string, cookie = '') => ctx.fns.procs.http.handle({req: new Request(origin + path, {headers: {accept: 'application/json', cookie}})});
    const mobile = `/v1/agents/${agent.id}/commands`;
    expect((await get(mobile)).status).toBe(401);
    expect((await get('/api' + mobile)).status).toBe(401);
    const handoff = await get('/auth/mobile/complete', setCookie!.split(';')[0]);
    const code = new URL(handoff.headers.get('location')).searchParams.get('code');
    const exchange = await ctx.fns.procs.http.handle({req: new Request(origin + '/auth/mobile/exchange', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({code})})});
    expect(exchange.status).toBe(200);
    const cookie = exchange.headers.get('set-cookie').split(';')[0];
    const response = await get(`/commands?version=2&agentId=${agent.id}`, cookie);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const v2 = await response.json();
    expect(v2).toMatchObject({version: 2, csrfToken: expect.any(String), sections: expect.arrayContaining([expect.objectContaining({id: 'commands', label: expect.any(String), order: expect.any(Number)})])});
    expect(v2.commands).toContainEqual(expect.objectContaining({name: 'goal', kind: 'client', clientAction: 'open-goal', enabled: true}));
    for (const path of [mobile, '/api' + mobile]) expect(await (await get(path, cookie)).json()).toEqual(v2);
    for (const path of ['/commands', '/commands?version=1', mobile + '?version=1']) {
        const legacy = await (await get(path, cookie)).json();
        expect(legacy.version).toBe(1); expect(legacy.sections).toBeUndefined();
        expect(legacy.commands.some((c: any) => v2.commands.find((v: any) => v.name === c.name)?.kind === 'client')).toBe(false);
        expect(legacy.commands).toContainEqual({name: 'plan', description: 'Plan before executing; advisory, not a sandbox', inputHint: '/plan [task|off]', attachments: false, usage: ['/plan','/plan <task>','/plan off']});
        for (const old of legacy.commands) expect(v2.commands.find((c: any) => c.name === old.name)).toMatchObject(old);
    }
    expect((await get('/v1/agents/missing/commands', cookie)).status).toBe(404);
});

test('dispatch rejects preset-hidden and unavailable commands before recording a claim', async () => {
    const ctx = await mkTestCtx();
    const agent = await ctx.fns.agent.start({model: 'mock:test', presetId: 'minimal'});
    const registry = ctx.state.commands.registry;
    registry['fixture:denied'] = {...registry.plan, builtin: false, name: 'fixture:denied', fn: 'commands.compact'};
    registry['fixture:failed'] = {...registry.trigger, builtin: true, name: 'fixture:failed', available: 'missing.check'};
    try {
        await expect(ctx.fns.commands.dispatch({agentId: agent.id, text: '/fixture:denied', requestId: 'denied'})).rejects.toMatchObject({code: 'unknown_command'});
        await expect(ctx.fns.commands.dispatch({agentId: agent.id, text: '/fixture:failed', requestId: 'failed'})).rejects.toMatchObject({code: 'command_unavailable'});
        ctx.state.agent[agent.id].isStreaming = true;
        await expect(ctx.fns.commands.dispatch({agentId: agent.id, text: '/compact', requestId: 'busy'})).rejects.toMatchObject({code: 'agent_running'});
        const rows = await ctx.fns.procs.db.select({sql: 'SELECT request_id FROM agent_command_requests WHERE agent_id=?', params: [agent.id]});
        expect(rows).toEqual([]);
    } finally {delete registry['fixture:denied']; delete registry['fixture:failed']; ctx.state.agent[agent.id].isStreaming = false;}
});
