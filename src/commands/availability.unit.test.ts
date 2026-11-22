import {expect, test, mock} from 'bun:test';
import candidates from './candidates';

function fixture() {
    const ctx: any = {state: {commands: {registry: {}}, agent: {}}, fns: {
        agentPreset: {predicate: ({snapshot}: any) => snapshot ? (fn: string) => !snapshot.denied.includes(fn) : undefined},
        procs: {db: {select: async () => [{workspace_dir: '/fixture', run_state: 'idle', preset_snapshot: {denied: ['plugin.secret']}}]}},
        commands: {workspaceCommands: async () => []}, plugin: {secret: mock(() => { throw Error('not allowed'); })},
    }};
    const add = (name: string, fields = {}) => ctx.state.commands.registry[name] = {name, kind: 'action', ...fields};
    return {ctx, add};
}

test('preset-hidden handlers and checks are unknown; prompts and built-ins survive', async () => {
    const {ctx, add} = fixture();
    add('bad-handler', {fn: 'plugin.secret'}); add('bad-check', {available: 'plugin.secret'});
    add('plan', {builtin: true, fn: 'plugin.secret'}); add('project:note', {kind: 'prompt'});
    const entries = await candidates(ctx, null, {agentId: 'a'});
    expect(entries.map(e => e.command.name)).toEqual(['plan', 'project:note']);
    expect(await candidates(ctx, null, {agentId: 'a', name: 'bad-check'})).toEqual([]);
    expect(ctx.fns.plugin.secret).not.toHaveBeenCalled();
});

test('static flags skip checks for new sessions and busy agents; denied static entries stay hidden', async () => {
    const {ctx, add} = fixture();
    ctx.state.agent.a = {isStreaming: true};
    ctx.fns.plugin.check = mock(() => ({enabled: true}));
    add('compact', {requiresSession: true, blockWhileRunning: true, available: 'plugin.check'});
    add('hidden', {blockWhileRunning: true, available: 'plugin.secret'});
    expect((await candidates(ctx, null, {name: 'compact'}))[0]).toMatchObject({enabled: false, code: 'session_required'});
    expect(await candidates(ctx, null, {agentId: 'a'})).toEqual([expect.objectContaining({enabled: false, code: 'agent_running'})]);
    expect(ctx.fns.plugin.check).not.toHaveBeenCalled(); expect(ctx.fns.plugin.secret).not.toHaveBeenCalled();
});

test('concurrent checks fail closed, preserve declared reasons, and time out together', async () => {
    const {ctx, add} = fixture();
    const starts: number[] = [];
    ctx.fns.plugin.slow = () => { starts.push(performance.now()); return new Promise(() => {}); };
    ctx.fns.plugin.broken = () => {throw Error('sensitive internal exception');};
    ctx.fns.plugin.offline = async () => ({enabled: false, reason: 'Offline'});
    for (const [name, check] of [['x','slow'],['y','slow'],['z','broken'],['w','offline']]) add(name!, {available: 'plugin.' + check});
    const start = performance.now();
    const entries = await candidates(ctx, null, {agentId: 'a'});
    expect(starts).toHaveLength(2);
    expect(starts[1]! - starts[0]!).toBeLessThan(200);
    expect(performance.now() - start).toBeLessThan(950);
    expect(entries.every(e => !e.enabled && e.code === 'command_unavailable')).toBe(true);
    expect(entries.at(-1)?.reason).toBe('Offline');
    expect(JSON.stringify(entries)).not.toContain('sensitive');
});
