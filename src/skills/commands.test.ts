import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkTestCtx } from '../_testCtx.entry';

// Skills in the existing command catalogue, parser and dispatch path. No model turn runs:
// the worker is stopped and the queue is inspected directly.
let ctx: any;
let base = '';
let dir = '';
let other = '';
let plugins = '';
const manifest = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\nFollow the ${name} checklist.\n`;
const pkg = (parent: string, name: string, description = name + ' skill.') => {
    mkdirSync(join(parent, name), { recursive: true });
    writeFileSync(join(parent, name, 'SKILL.md'), manifest(name, description));
};
const start = async (presetId = 'standard', workspaceDir = dir) => {
    const agent = await ctx.fns.agent.start({ model: 'mock:test', workspaceDir, preset: await ctx.fns.agentPreset.resolve({ id: presetId }) });
    await ctx.fns.session.save({ agent });
    return agent;
};
const names = async (opts: Record<string, string>) => (await ctx.fns.commands.catalogue({ version: 2, ...opts })).commands.filter((c: any) => c.kind === 'skill').map((c: any) => c.name);

beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'skill-commands-'));
    dir = join(base, 'project');
    other = join(base, 'other');
    plugins = join(base, 'plugins');
    mkdirSync(other, { recursive: true });
    ctx = await mkTestCtx({ env: { MAUZCODE_SKILLS_DIR: join(base, 'library') } });
    ctx.state.registry.agent.wakeWorker = () => {};
    pkg(join(dir, '.mauzcode/skills'), 'review', 'Workspace review.');
    pkg(join(dir, '.mauzcode/skills'), '3d-print', 'Digit-leading name.');
    const folder = join(plugins, 'git');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'git', procs: { skills: ['skills/review'] } }));
    pkg(join(folder, 'skills'), 'review', 'Git review.');
    ctx.state.procs.modules = [...ctx.state.procs.modules.filter((m: any) => m.name !== 'git'), { name: 'git', dir: folder, plugin: true, label: 'Git', description: '', namespaces: [], fns: [], routes: [], hooks: [], loaders: [], provides: [], clients: [], domains: [], config: {}, source: 'user', from: null, skill: null, tab: false, optional: true, place: 'right', preview: null, icon: '' }];
    writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ enabledPluginSkills: ['skill.plugin.git:review'] }));
    // Route-level tests need an authorized viewer; the project catalogue itself is out of scope here.
    ctx.state.registry.projects.principal = async () => 'instance:test';
    const realGet = ctx.state.registry.projects.get;
    ctx.state.registry.projects.get = async (c: any, s: any, o: { projectId: string }) => {
        for (const path of [dir, other]) {
            const identity = await ctx.fns.projects.identity({ dir: path, host: '' });
            if (identity.id === o.projectId) return { ...identity, title: path, virtual: true };
        }
        return realGet(c, s, o).catch(() => null);
    };
}, 60_000);
afterAll(() => { if (base) rmSync(base, { recursive: true, force: true }); });

test('existing chats list their own skills in the Skills section; version 1 and ordinary commands are unchanged', async () => {
    const agent = await start();
    const catalogue = await ctx.fns.commands.catalogue({ version: 2, agentId: agent.id });
    expect(catalogue.sections).toContainEqual({ id: 'skills', label: 'Skills', order: 20 });
    const skills = catalogue.commands.filter((c: any) => c.kind === 'skill');
    expect(skills.map((c: any) => [c.name, c.label, c.skill.source, c.section])).toEqual([
        ['skill.plugin.git:review', 'review', 'Git', 'skills'],
        ['skill.workspace:3d-print', '3d-print', 'Workspace', 'skills'],
        ['skill.workspace:review', 'review', 'Workspace', 'skills'],
    ]);
    expect(JSON.stringify(skills)).not.toContain('checklist');
    for (const name of ['plan', 'compact']) expect(catalogue.commands.some((c: any) => c.name === name)).toBe(true);
    const legacy = await ctx.fns.commands.catalogue({ version: 1, agentId: agent.id });
    expect(legacy.commands.some((c: any) => c.name.startsWith('skill.'))).toBe(false);
    // Another project's chat does not see these workspace skills; Minimal sees none.
    expect(await names({ agentId: (await start('standard', other)).id })).toEqual([]);
    expect(await names({ agentId: (await start('minimal')).id })).toEqual([]);
});

test('new-session discovery uses the selected project and preset, never another project', async () => {
    const identity = await ctx.fns.projects.identity({ dir, host: '' });
    // Without an authorized project id there are no skills at all.
    expect(await names({})).toEqual([]);
    expect(await names({ projectId: 'p_' + '0'.repeat(64) })).toEqual([]);
    expect(await names({ projectId: (await ctx.fns.projects.identity({ dir: other, host: '' })).id })).toEqual([]);
    expect(await names({ projectId: identity.id })).toEqual(['skill.plugin.git:review', 'skill.workspace:3d-print', 'skill.workspace:review']);
    expect(await names({ projectId: identity.id, presetId: 'minimal' })).toEqual([]);
});

test('parser accepts canonical skill IDs, keeps ordinary paths and prose, and declarations cannot squat skill.', async () => {
    expect(await ctx.fns.commands.parse({ text: '/skill.workspace:3d-print make it' })).toEqual({ name: 'skill.workspace:3d-print', args: 'make it' });
    expect(await ctx.fns.commands.parse({ text: '/skill.plugin.git:review' })).toEqual({ name: 'skill.plugin.git:review', args: '' });
    await expect(ctx.fns.commands.parse({ text: '/skill.unknown:review' })).rejects.toThrow('Unknown command');
    await expect(ctx.fns.commands.parse({ text: '/review check' })).rejects.toThrow('Unknown command /review');
    expect(await ctx.fns.commands.parse({ text: '/usr/bin/env' })).toBeNull();
    expect(await ctx.fns.commands.parse({ text: '/etc/skill.conf' })).toBeNull();
    expect(await ctx.fns.commands.parse({ text: '/plan' })).toEqual({ name: 'plan', args: '' });
    await expect(ctx.fns.commands.validateDeclaration({ declaration: { kind: 'prompt', label: 'x', description: 'x', template: 'x' }, namespace: 'skill.plugin.git', shortName: 'review', source: 'test' })).rejects.toThrow('reserved for Agent Skills');
    await expect(ctx.fns.commands.validateDeclaration({ declaration: { kind: 'skill', label: 'x', description: 'x' }, namespace: 'git', shortName: 'review', source: 'test' })).rejects.toThrow('cannot be declared');
});

test('dispatch keeps the user text, records a completed read_skill and schedules exactly one turn', async () => {
    const agent = await start();
    const result = await ctx.fns.commands.dispatch({ agentId: agent.id, text: '/skill.plugin.git:review check my changes', requestId: 'skill-request-0001' });
    expect(result).toMatchObject({ ok: true, status: 'completed', command: 'skill.plugin.git:review', scheduled: true });
    const loaded = await ctx.fns.session.load({ id: agent.id });
    const tail = loaded.messages.slice(-3).map((m: any) => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 60) : m.content, calls: m.tool_calls?.map((c: any) => [c.name, c.args]) }));
    expect(tail[0]).toEqual({ role: 'user', content: '/skill.plugin.git:review check my changes', calls: undefined });
    expect(tail[1].calls).toEqual([['read_skill', { id: 'skill.plugin.git:review' }]]);
    expect(tail[2].role).toBe('tool');
    expect(loaded.messages.at(-1).content).toContain('Follow the review checklist.');
    const user = loaded.events.findLast((e: any) => e.type === 'user');
    expect(user.command).toMatchObject({ name: 'skill.plugin.git:review', kind: 'skill', text: '/skill.plugin.git:review check my changes', argsText: 'check my changes', skill: { id: 'skill.plugin.git:review', name: 'review', source: 'Git' } });
    expect(loaded.events.findLast((e: any) => e.type === 'tool_call')).toMatchObject({ name: 'read_skill' });
    const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT next_run_at FROM agents WHERE id=?', params: [agent.id] });
    expect(Number(row.next_run_at)).toBeGreaterThan(0);
    // The same key replays; a different command under it conflicts.
    expect(await ctx.fns.commands.dispatch({ agentId: agent.id, text: '/skill.plugin.git:review check my changes', requestId: 'skill-request-0001' })).toMatchObject({ duplicate: true });
    await expect(ctx.fns.commands.dispatch({ agentId: agent.id, text: '/skill.workspace:review', requestId: 'skill-request-0001' })).rejects.toThrow('Idempotency');
    expect((await ctx.fns.session.load({ id: agent.id })).messages.length).toBe(loaded.messages.length);
});

test('unavailable skills never fall back or schedule, and old snapshots are told to open a new chat', async () => {
    const agent = await start();
    const before = (await ctx.fns.session.load({ id: agent.id })).messages.length;
    writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ enabledPluginSkills: [] }));
    try {
        await expect(ctx.fns.commands.dispatch({ agentId: agent.id, text: '/skill.plugin.git:review now', requestId: 'skill-request-0002' })).rejects.toThrow('Unknown command');
    } finally {
        writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ enabledPluginSkills: ['skill.plugin.git:review'] }));
    }
    await expect(ctx.fns.commands.dispatch({ agentId: agent.id, text: '/skill.workspace:missing now', requestId: 'skill-request-0003' })).rejects.toThrow('Unknown command');
    expect((await ctx.fns.session.load({ id: agent.id })).messages.length).toBe(before);
    const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT next_run_at FROM agents WHERE id=?', params: [agent.id] });
    expect(row.next_run_at).toBeNull();

    const previous = await ctx.fns.agentPreset.resolve({ id: 'standard' });
    previous.layers[0].allow = previous.layers[0].allow.filter((p: string) => !p.startsWith('skills.') && p !== 'tools.readSkill');
    const old = await ctx.fns.agent.start({ model: 'mock:test', workspaceDir: dir, preset: previous });
    await expect(ctx.fns.commands.dispatch({ agentId: old.id, text: '/skill.workspace:review', requestId: 'skill-request-0004' })).rejects.toThrow('Open a new chat');
});

test('the message route dispatches a pasted skill command without the menu', async () => {
    const agent = await start();
    const req = new Request('http://local/agent/' + agent.id + '/message', { method: 'POST', headers: { 'content-type': 'text/plain', 'idempotency-key': 'skill-route-0001' }, body: '/skill.workspace:review please' });
    const response = await ctx.fns.agent.acceptMessage({ req, params: { id: agent.id } });
    expect(response.status).toBeLessThan(300);
    const loaded = await ctx.fns.session.load({ id: agent.id });
    expect(loaded.events.findLast((e: any) => e.type === 'user').command.name).toBe('skill.workspace:review');
});
