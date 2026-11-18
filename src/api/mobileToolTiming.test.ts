import { expect, test } from 'bun:test';
import route from './$route_v1_agents_$id_events_GET';

test('projects measured tool durations and explicit timeouts without inventing an eval deadline', async () => {
    const events = [
        { idx: 0, ts: 1, type: 'tool_call', name: 'tools_eval', args: { code: '1' }, durationMs: 52.84 },
        { idx: 1, ts: 2, type: 'tool_call', name: 'bash', args: { command: 'sleep 10', timeout: 5 }, durationMs: 5001, isError: true },
        { idx: 2, ts: 3, type: 'tool_call', name: 'eval', args: { code: '1' } },
        { idx: 3, ts: 4, type: 'tool_result', name: 'eval', durationMs: 0 },
    ];
    const ctx: any = { state: {}, fns: {
        auth: { author: async () => null }, mentions: { parse: async () => [] },
        procs: { db: { select: async ({ sql }: { sql: string }) => sql.includes('SELECT 1') ? [{}] : [{ run_state: 'running' }] } },
        session: { getMaxEventIdx: async () => 3, getEvents: async () => events },
        tools: { presentation: ({ name }: any) => ({ label: String(name), icon: 'wrench', category: 'tools', summary: '' }), runs: () => [
            { id: 'eval', name: 'tools_eval', label: 'Eval', icon: 'code', category: 'commands', summary: 'await task()', args: { code: 'await task()' }, argsLarge: false, startedAt: 1000, timeoutMs: null, aborted: false, output: '', outputStart: 0 },
            { id: 'bash', name: 'bash', label: 'Bash', icon: 'terminal', category: 'commands', summary: 'sleep 10', args: {}, argsLarge: true, startedAt: 1000, timeoutMs: 5000, aborted: true, output: 'x'.repeat(5000), outputStart: 7 },
        ] },
    } };
    const response = await route(ctx, null, { req: new Request('http://local/api/v1/agents/fixture/events'), params: { id: 'fixture' } });
    const body = await response.json() as {events: Array<{durationMs: number | null; timeoutMs: number | null}>; activeTools: unknown[]};
    expect(body.events.map(({ durationMs, timeoutMs }) => ({ durationMs, timeoutMs }))).toEqual([
        { durationMs: 52.84, timeoutMs: null }, { durationMs: 5001, timeoutMs: 5000 },
        { durationMs: null, timeoutMs: null }, { durationMs: 0, timeoutMs: null },
    ]);
    expect(body.activeTools).toMatchObject([
        { id: 'eval', label: 'Eval', icon: 'code', category: 'commands', summary: 'await task()', args: { code: 'await task()' }, startedAt: 1000, timeoutMs: null, state: 'running', outputStart: 0, outputEnd: 0 },
        { id: 'bash', summary: 'sleep 10', argsLarge: true, startedAt: 1000, timeoutMs: 5000, state: 'stopping', outputStart: 7, outputEnd: 5007 },
    ]);
    // The collapsed row gets a short tail; the full output is fetched by offset.
    expect((body.activeTools[1] as any).tail.length).toBe(4096);
    expect(body.activeTools[1]).not.toHaveProperty('args');
});
