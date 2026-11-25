import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkTestCtx } from '../_testCtx.entry';

// Cross-surface acceptance (task 8.1) in one isolated fixture: a workspace package, a mounted plugin
// exporting `review`, and both server scopes. SSH variants run in materialize.it.test.ts and
// workspaceSource.it.test.ts. No model turn runs; the worker is stopped.
let ctx: any;
let base = '';
let dir = '';
const manifest = (name: string, description: string, body: string) => `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`;
const pkg = (parent: string, name: string, description: string, body = 'Instructions for ' + name + '.') => {
    mkdirSync(join(parent, name, 'scripts'), { recursive: true });
    writeFileSync(join(parent, name, 'SKILL.md'), manifest(name, description, body));
    return join(parent, name);
};
const as = (agent: any) => { const scoped = Object.create(ctx); scoped.session = ctx.fns.session.forAgent({ agent }); return scoped; };
const enable = (ids: string[]) => writeFileSync(join(dir, '.mauzcode/skills.json'), JSON.stringify({ enabledPluginSkills: ids }));

beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'skill-acceptance-'));
    dir = join(base, 'project');
    ctx = await mkTestCtx({ env: { MAUZCODE_SKILLS_DIR: join(base, 'library'), HOME: join(base, 'home') } });
    ctx.state.registry.agent.wakeWorker = () => {};
    ctx.state.registry.projects.principal = async () => 'instance:test';
    const realGet = ctx.state.registry.projects.get;
    ctx.state.registry.projects.get = async (c: any, s: any, o: { projectId: string }) => {
        const identity = await ctx.fns.projects.identity({ dir, host: '' });
        return identity.id === o.projectId ? { ...identity, title: 'project', virtual: true } : realGet(c, s, o).catch(() => null);
    };
    const local = pkg(join(dir, '.mauzcode/skills'), 'review', 'Workspace review checklist.');
    writeFileSync(join(local, 'scripts/check.sh'), '#!/bin/sh\necho workspace-checked\n');
    chmodSync(join(local, 'scripts/check.sh'), 0o755);
    const folder = join(base, 'plugins/git');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ name: 'git', procs: { skills: ['skills/review'] } }));
    pkg(join(folder, 'skills'), 'review', 'Git review of the staged diff.');
    ctx.state.procs.modules = [...ctx.state.procs.modules.filter((m: any) => m.name !== 'git'), { name: 'git', dir: folder, plugin: true, label: 'Git', description: '', namespaces: [], fns: [], routes: [], hooks: [], loaders: [], provides: [], clients: [], domains: [], config: {}, source: 'user', from: null, skill: null, tab: false, optional: true, place: 'right', preview: null, icon: '' }];
    const library = await ctx.fns.skills.serverLibrary({ workspace: { host: '', dir } });
    const global = pkg(library.globalDir, 'style', 'Team style guide.');
    writeFileSync(join(global, 'scripts/lint.sh'), '#!/bin/sh\necho global-linted\n');
    chmodSync(join(global, 'scripts/lint.sh'), 0o755);
    pkg(library.projectDir, 'deploy', 'Project deployment steps.');
    enable(['skill.plugin.git:review']);
}, 60_000);
afterAll(() => { if (base) { Bun.spawnSync(['chmod', '-R', 'u+w', base]); rmSync(base, { recursive: true, force: true }); } });

test('one project, four sources: discovery, selection, scripts, invocation, history and revocation', async () => {
    const agent = await ctx.fns.agent.start({ model: 'mock:test', workspaceDir: dir, preset: await ctx.fns.agentPreset.resolve({ id: 'standard' }) });
    await ctx.fns.session.save({ agent });
    const all = ['skill.plugin.git:review', 'skill.server.global:style', 'skill.server.project:deploy', 'skill.workspace:review'];

    // Metadata travels at the request boundary, not in the reusable bootstrap.
    const prompt = await ctx.fns.agent.fullSystemPrompt({ agent });
    expect(await ctx.fns.agent.syncSkillCatalogue({ agent })).toBe(true);
    const advertised = agent.messages.at(-1).content;
    for (const id of all) { expect(prompt).not.toContain(id); expect(advertised).toContain('- ' + id + ' ('); }
    expect(advertised).not.toContain('Instructions for');
    expect((await as(agent).fns.skills.list({})).skills.map((s: any) => s.id)).toEqual(all);
    const menu = (await ctx.fns.commands.catalogue({ version: 2, agentId: agent.id })).commands.filter((c: any) => c.kind === 'skill');
    expect(menu.map((c: any) => [c.name, c.skill.source])).toEqual([['skill.plugin.git:review', 'Git'], ['skill.server.global:style', 'Server · global'], ['skill.server.project:deploy', 'Server · project'], ['skill.workspace:review', 'Workspace']]);
    expect((await ctx.fns.commands.catalogue({ version: 2, agentId: agent.id })).commands.some((c: any) => c.name === 'plan')).toBe(true);

    // Automatic selection: the model calls read_skill itself and runs the packaged scripts with its own shell.
    const local = await ctx.fns.tools.call({ name: 'read_skill', agent, args: { id: 'skill.workspace:review' } });
    const localDir = /directory: (\S+)/.exec(local.output)?.[1];
    if (!localDir) throw Error('read_skill did not return a workspace directory');
    expect(localDir).toBe(join(dir, '.mauzcode/skills/review'));
    expect(Bun.spawnSync([join(localDir, 'scripts/check.sh')]).stdout.toString()).toBe('workspace-checked\n');
    const global = await ctx.fns.tools.call({ name: 'read_skill', agent, args: { id: 'skill.server.global:style' } });
    const globalDir = /directory: (\S+)/.exec(global.output)?.[1];
    if (!globalDir) throw Error('read_skill did not return a server cache directory');
    expect(globalDir.startsWith(join(base, 'home/.cache/mauzcode/skills/skill.server.global:style/'))).toBe(true);
    expect(Bun.spawnSync([join(globalDir, 'scripts/lint.sh')]).stdout.toString()).toBe('global-linted\n');

    // Invocation in the existing chat: user text kept, read_skill recorded, one turn scheduled.
    await ctx.fns.commands.dispatch({ agentId: agent.id, text: '/skill.plugin.git:review check my changes', requestId: 'acceptance-0001' });
    let loaded = await ctx.fns.session.load({ id: agent.id });
    const user = loaded.events.findLast((e: any) => e.type === 'user');
    expect(user.command).toMatchObject({ name: 'skill.plugin.git:review', text: '/skill.plugin.git:review check my changes', skill: { name: 'review', source: 'Git' } });
    expect(loaded.messages.at(-1).content).toContain('Instructions for review.');

    // Revocation: disabling the export hides it everywhere and rejects its invocation; history and other skills remain.
    enable([]);
    expect((await as(agent).fns.skills.list({})).skills.map((s: any) => s.id)).toEqual(all.slice(1));
    await expect(as(agent).fns.skills.read({ id: 'skill.plugin.git:review' })).rejects.toThrow('not available');
    await expect(ctx.fns.commands.dispatch({ agentId: agent.id, text: '/skill.plugin.git:review again', requestId: 'acceptance-0002' })).rejects.toThrow('Unknown command');
    loaded = await ctx.fns.session.load({ id: agent.id });
    expect(loaded.events.findLast((e: any) => e.type === 'user').command.skill).toEqual({ id: 'skill.plugin.git:review', name: 'review', source: 'Git' });
    expect((await as(agent).fns.skills.read({ id: 'skill.server.project:deploy' })).instructions).toContain('Instructions for deploy.');
    enable(['skill.plugin.git:review']);
});

test('first message of a new chat uses the selected project and preset, and the created chat agrees', async () => {
    const projectId = (await ctx.fns.projects.identity({ dir, host: '' })).id;
    const menu = (await ctx.fns.commands.catalogue({ version: 2, projectId, presetId: 'standard' })).commands.filter((c: any) => c.kind === 'skill').map((c: any) => c.name);
    expect(menu).toContain('skill.server.project:deploy');
    expect((await ctx.fns.commands.catalogue({ version: 2, projectId, presetId: 'minimal' })).commands.filter((c: any) => c.kind === 'skill')).toEqual([]);
    const [entry] = await ctx.fns.commands.candidates({ name: 'skill.server.project:deploy', projectId, presetId: 'standard' });
    expect(entry.enabled).toBe(true);
    const created = await ctx.fns.agent.start({ model: 'mock:test', workspaceDir: dir, preset: await ctx.fns.agentPreset.resolve({ id: 'standard' }) });
    await ctx.fns.session.save({ agent: created });
    const req = new Request('http://local/agent/' + created.id + '/message', { method: 'POST', headers: { 'content-type': 'text/plain', 'idempotency-key': 'acceptance-first-1' }, body: '/skill.server.project:deploy to staging' });
    expect((await ctx.fns.agent.acceptMessage({ req, params: { id: created.id } })).status).toBe(200);
    const after = (await ctx.fns.commands.catalogue({ version: 2, agentId: created.id })).commands.filter((c: any) => c.kind === 'skill').map((c: any) => c.name);
    expect(after).toEqual(menu);
});

test('existing integrations stay compatible: plugin docs, external skill mounts and ordinary commands', async () => {
    const doc = await ctx.fns.plugins.read({ name: 'openspec' }).catch((error: Error) => ({ error: error.message }));
    expect(JSON.stringify(doc)).not.toContain('skill.plugin.');
    expect(await ctx.fns.commands.parse({ text: '/plan' })).toEqual({ name: 'plan', args: '' });
    expect(await ctx.fns.commands.parse({ text: '/usr/local/bin/tool' })).toBeNull();
    expect(typeof ctx.fns.external?.mountSkills).toBe('function');
});
