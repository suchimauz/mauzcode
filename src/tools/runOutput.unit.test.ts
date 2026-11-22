import { describe, expect, test } from 'bun:test';
import beginRun from './beginRun';
import appendRunOutput from './appendRunOutput';
import endRun from './endRun';
import runs from './runs';
import authorizeRunRead from './authorizeRunRead';
import iconKeys from '../ui/iconKeys';
import presentation from './presentation';
import summaryTemplate from './summaryTemplate';
import summaryFormat from './summaryFormat';
import normalizePresentation from './normalizePresentation';
import redactArgs from './redactArgs';
import declaration from './declaration';
import list from './list';
import outputRoute from '../api/$route_v1_agents_$id_runs_$runId_output_GET';
import argsRoute from '../api/$route_v1_agents_$id_runs_$runId_args_GET';

// Isolated from _testCtx: the registry is in memory, auth and agents are stubbed.
const bash = { key: 'tools.bash', name: 'bash', module: 'tools', presentation: { label: 'Bash', icon: 'terminal', category: 'commands', summary: '@command' }, parameters: { type: 'object', properties: { command: { type: 'string' }, env: { type: 'object' }, secrets: { type: 'object' } } } };
const plugin = { key: 'gitUi.gitReviewComments', name: 'gitReviewComments', module: 'gitUi', presentation: { label: 'Review comments', icon: 'comment', category: 'git', summary: '{path}[ · {status}]' }, parameters: { type: 'object', properties: {} } };
const evalTool = { key: 'tools.eval', name: 'eval', module: 'tools', presentation: { label: 'Eval', icon: 'code', category: 'commands', summary: '@code' }, parameters: { type: 'object', properties: {} } };

function fixture(owners: Record<string, string | null> = { a: 'u1', b: 'u2' }, user: string | null = 'u1') {
    const refreshes: string[] = [];
    const ctx: any = { state: { tools: { registry: new Map([bash, plugin, evalTool].map(t => [t.key, t])) } }, fns: {} };
    const bind = (fn: any) => (o: any) => fn(ctx, null, o);
    ctx.fns.ui = { iconKeys: bind(iconKeys) };
    ctx.fns.tools = {
        beginRun: bind(beginRun), appendRunOutput: bind(appendRunOutput), endRun: bind(endRun), runs: bind(runs),
        authorizeRunRead: bind(authorizeRunRead), presentation: bind(presentation), summaryTemplate: bind(summaryTemplate),
        summaryFormat: bind(summaryFormat), normalizePresentation: bind(normalizePresentation), redactArgs: bind(redactArgs),
        declaration: bind(declaration), list: bind(list),
    };
    ctx.fns.procs = {
        events: { refresh: ({ reason }: any) => refreshes.push(reason) },
        db: { select: async ({ params }: any) => params[0] in owners ? [{ created_by: owners[params[0]] }] : [] },
    };
    ctx.fns.auth = { currentUser: async () => ({ user: user ? { id: user } : null, required: true }) };
    return { ctx, refreshes };
}
const get = (route: any, ctx: any, agent: string, runId: string, query = '') =>
    route(ctx, null, { req: new Request(`http://local/api/v1/agents/${agent}/runs/${runId}/x${query}`), params: { id: agent, runId } });

describe('running calls', () => {
    test('a running call is presented like the finished one, with full summary and redacted args', () => {
        const { ctx } = fixture();
        const command = 'echo ' + 'x'.repeat(2000) + '\nsecond line';
        const run = ctx.fns.tools.beginRun({ agentId: 'a', name: 'bash', args: { command, secrets: { T: 'secret://ns/t' }, env: { A: '1' } } });
        expect(run).toMatchObject({ label: 'Bash', icon: 'terminal', category: 'commands', summary: command.split('\n')[0], argsLarge: false });
        expect(run.args).toEqual({ command, secrets: '••• (1 key)', env: '••• (1 key)' });
        expect(JSON.stringify(run)).not.toContain('secret://');
        const finished = ctx.fns.tools.presentation({ name: 'bash', args: { command } });
        expect({ label: run.label, icon: run.icon, category: run.category, summary: run.summary }).toEqual(finished);
        for (const [name, args] of [['tools_eval', { code: 'await x()' }], ['gitReviewComments', { path: 'a.ts', status: 'open' }]] as const) {
            const live = ctx.fns.tools.beginRun({ agentId: 'a', name, args });
            const done = ctx.fns.tools.presentation({ name, args });
            expect({ label: live.label, icon: live.icon, category: live.category, summary: live.summary }).toEqual(done);
        }
    });

    test('large arguments are referenced, not broadcast', async () => {
        const { ctx } = fixture();
        const big = 'y'.repeat(70 * 1024);
        const run = ctx.fns.tools.beginRun({ agentId: 'a', name: 'bash', args: { command: big } });
        expect(run.argsLarge).toBe(true);
        const response = await get(argsRoute, ctx, 'a', run.id);
        expect(response.status).toBe(200);
        expect((await response.json()).args.command.length).toBe(big.length);
    });

    test('output is retained in full and served by offset without gaps or duplicates', async () => {
        const { ctx } = fixture();
        const run = ctx.fns.tools.beginRun({ agentId: 'a', name: 'bash', args: { command: 'seq' } });
        const lines = Array.from({ length: 50_000 }, (_, i) => `${i + 1}\n`);
        for (const line of lines.slice(0, 25_000)) ctx.fns.tools.appendRunOutput({ id: run.id, chunk: line });
        const first = await (await get(outputRoute, ctx, 'a', run.id, '?from=0')).json();
        expect(first.start).toBe(0);
        expect(first.text.startsWith('1\n2\n')).toBe(true);
        for (const line of lines.slice(25_000)) ctx.fns.tools.appendRunOutput({ id: run.id, chunk: line });
        const next = await (await get(outputRoute, ctx, 'a', run.id, `?from=${first.end}`)).json();
        expect(first.text + next.text).toBe(lines.join(''));
        const again = await (await get(outputRoute, ctx, 'a', run.id, `?from=${next.end}`)).json();
        expect(again.text).toBe('');
    });

    test('output beyond the per-run cap drops the oldest part and keeps offsets valid', async () => {
        const { ctx } = fixture();
        const run = ctx.fns.tools.beginRun({ agentId: 'a', name: 'bash', args: { command: 'yes' } });
        const chunk = 'z'.repeat(1024 * 1024);
        for (let i = 0; i < 17; i++) ctx.fns.tools.appendRunOutput({ id: run.id, chunk });
        ctx.fns.tools.appendRunOutput({ id: run.id, chunk: 'END' });
        const body = await (await get(outputRoute, ctx, 'a', run.id, '?from=0')).json();
        expect(body.start).toBe(17 * 1024 * 1024 + 3 - 16 * 1024 * 1024);
        expect(body.from).toBe(body.start);
        expect(body.end - body.start).toBe(16 * 1024 * 1024);
        expect(body.text.endsWith('END')).toBe(true);
    });

    test('retained output is released when the call ends and the route answers 404', async () => {
        const { ctx } = fixture();
        const run = ctx.fns.tools.beginRun({ agentId: 'a', name: 'bash', args: { command: 'x' } });
        ctx.fns.tools.appendRunOutput({ id: run.id, chunk: 'hello' });
        ctx.fns.tools.endRun({ id: run.id });
        expect(run.output).toBe('');
        expect((await get(outputRoute, ctx, 'a', run.id)).status).toBe(404);
        expect((await get(argsRoute, ctx, 'a', run.id)).status).toBe(404);
    });

    test('foreign, unknown and anonymous readers get no output', async () => {
        const { ctx } = fixture();
        const run = ctx.fns.tools.beginRun({ agentId: 'b', name: 'bash', args: { command: 'x' } });
        ctx.fns.tools.appendRunOutput({ id: run.id, chunk: 'private' });
        const foreign = await get(outputRoute, ctx, 'b', run.id);
        expect(foreign.status).toBe(404);
        expect(await foreign.text()).not.toContain('private');
        // The run id alone is not a capability: it must belong to the agent in the URL.
        expect((await get(outputRoute, ctx, 'a', run.id)).status).toBe(404);
        expect((await get(outputRoute, ctx, 'missing', run.id)).status).toBe(404);
        const anon = fixture({ b: 'u2' }, null);
        const anonRun = anon.ctx.fns.tools.beginRun({ agentId: 'b', name: 'bash', args: {} });
        expect((await get(outputRoute, anon.ctx, 'b', anonRun.id)).status).toBe(401);
        const owner = fixture({ b: 'u2' }, 'u2');
        const ownRun = owner.ctx.fns.tools.beginRun({ agentId: 'b', name: 'bash', args: {} });
        owner.ctx.fns.tools.appendRunOutput({ id: ownRun.id, chunk: 'mine' });
        expect((await (await get(outputRoute, owner.ctx, 'b', ownRun.id)).json()).text).toBe('mine');
    });
});
