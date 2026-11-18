import { expect, test } from 'bun:test';
import eventsRoute from './$route_v1_agents_$id_events_GET';
import detailRoute from './$route_v1_agents_$id_events_$idx_GET';
import presentation from '../tools/presentation';
import summaryTemplate from '../tools/summaryTemplate';
import summaryFormat from '../tools/summaryFormat';
import normalizePresentation from '../tools/normalizePresentation';
import redactArgs from '../tools/redactArgs';
import declaration from '../tools/declaration';
import list from '../tools/list';

// The chat routes use the real resolver over a stubbed registry: the plugin
// tool is mounted but granted to nobody, which must not matter for display.
const tools = [
    { key: 'tools.bash', name: 'bash', module: 'tools', presentation: { label: 'Bash', icon: 'terminal', category: 'commands', summary: '@command' }, parameters: { type: 'object', properties: { command: { type: 'string' }, secrets: { type: 'object' }, env: { type: 'object' } } } },
    { key: 'tools.eval', name: 'eval', module: 'tools', presentation: { label: 'Eval', icon: 'code', category: 'commands', summary: '@code' }, parameters: { type: 'object', properties: {} } },
    { key: 'tools.todo_update', name: 'todo_update', module: 'tools', presentation: { label: 'Todos', icon: 'checklist', category: 'agent', summary: '@todos' }, parameters: { type: 'object', properties: {} } },
    { key: 'agent.respondHtml', name: 'respondHtml', module: 'agent', presentation: { label: 'Answer', icon: 'answer', category: 'agent', summary: '{text|first-line}' }, parameters: { type: 'object', properties: {} } },
    { key: 'gitUi.gitReviewComments', name: 'gitReviewComments', module: 'gitUi', presentation: { label: 'Review comments', icon: 'comment', category: 'git', summary: '{path}[ · {status}]' }, parameters: { type: 'object', properties: {} } },
];
function ctxWith(events: any[], payload?: any) {
    const ctx: any = { state: { tools: { registry: new Map(tools.map(t => [t.key, t])) } }, fns: {} };
    const bind = (fn: any) => (o: any) => fn(ctx, null, o);
    ctx.fns.tools = { presentation: bind(presentation), summaryTemplate: bind(summaryTemplate), summaryFormat: bind(summaryFormat), normalizePresentation: bind(normalizePresentation), redactArgs: bind(redactArgs), declaration: bind(declaration), list: bind(list), runs: () => [] };
    ctx.fns.auth = { author: async () => null };
    ctx.fns.mentions = { parse: async () => [] };
    ctx.fns.session = { getEvents: async () => events, getMaxEventIdx: async () => events.length };
    ctx.fns.procs = { db: { select: async ({ sql }: any) => sql.includes('FROM events') ? [{ idx: 7, ts: 10, payload: JSON.stringify(payload) }] : sql.includes('SELECT 1') ? [{ exists: 1 }] : [{ run_state: 'idle', next_run_at: null }] } };
    return ctx;
}

test('events carry label, icon, category and full summary for known, plugin, alias and undeclared tools', async () => {
    const long = 'npm run ' + 'x'.repeat(3000);
    const events = [
        { idx: 0, ts: 1, type: 'tool_call', name: 'bash', args: { command: `${long}\nsecond`, secrets: { T: 'secret://ns/t' } } },
        { idx: 1, ts: 2, type: 'tool_call', name: 'tools_eval', args: { code: 'return 1' } },
        { idx: 2, ts: 3, type: 'tool_call', name: 'gitReviewComments', args: { path: 'src/a.ts', status: 'open' } },
        { idx: 3, ts: 4, type: 'tool_call', name: 'todo_update', args: { tasks: [{}, {}, {}] } },
        { idx: 4, ts: 5, type: 'tool_call', name: 'respondHtml', args: { html: '<b>secret html</b>', text: 'Done\nmore' } },
        { idx: 5, ts: 6, type: 'tool_call', name: 'removedPlugin.old_tool', args: { spec: { a: 1 }, n: 2 } },
    ];
    const body: any = await (await eventsRoute(ctxWith(events), null, { req: new Request('http://local/api/v1/agents/a/events'), params: { id: 'a' } })).json();
    const shown = body.events.map((e: any) => ({ label: e.toolLabel, icon: e.toolIcon, category: e.toolCategory, summary: e.toolSummary }));
    expect(shown).toEqual([
        { label: 'Bash', icon: 'terminal', category: 'commands', summary: long },
        { label: 'Eval', icon: 'code', category: 'commands', summary: 'return 1' },
        { label: 'Review comments', icon: 'comment', category: 'git', summary: 'src/a.ts · open' },
        { label: 'Todos', icon: 'checklist', category: 'agent', summary: '3 tasks' },
        { label: 'Answer', icon: 'answer', category: 'agent', summary: 'Done' },
        { label: 'removedPlugin.old_tool', icon: 'wrench', category: 'tools', summary: '' },
    ]);
    expect(JSON.stringify(body)).not.toContain('secret html');
    expect(JSON.stringify(body)).not.toContain('secret://');
});

test('tool details return complete, redacted arguments', async () => {
    const command = 'echo ' + 'y'.repeat(50_000);
    const payload = { type: 'tool_call', name: 'bash', args: { command, secrets: { T: 'secret://ns/t' }, env: { A: 'value' } }, result: 'ok' };
    const body: any = await (await detailRoute(ctxWith([], payload), null, { req: new Request('http://local/api/v1/agents/a/events/7'), params: { id: 'a', idx: '7' } })).json();
    expect(body.event).toMatchObject({ label: 'Bash', icon: 'terminal', category: 'commands', argsTruncated: false });
    const args = JSON.parse(body.event.args);
    expect(args).toEqual({ command, secrets: '••• (1 key)', env: '••• (1 key)' });
    expect(body.event.args).not.toContain('secret://');
    expect(body.event.args).not.toContain('value');
});
