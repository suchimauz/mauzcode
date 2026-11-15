import { describe, expect, test } from 'bun:test';
import wireTools from './wireTools';
import allows from '../agentPreset/allows';
import origin from '../agentPreset/origin';
import generation from '../agentPreset/generation';
import compilePattern from '../agentPreset/compilePattern';
import defaults from '../agentPreset/defaults';
import coreCatalogue from '../agentPreset/coreCatalogue';
import list from '../tools/list';

function fixture(id = 'standard', tools?: string[]) {
    const declarations = ['bash', 'read', 'write', 'edit', 'eval', 'grep'].map(name => ({
        key: `tools.${name}`, module: 'tools', name, description: name, parameters: { type: 'object' },
    }));
    const ctx: any = { state: { registry: {}, procs: { boot: {} }, tools: { registry: new Map(declarations.map(t => [t.key, t])) } }, fns: {
        plugins: { list: () => [{ name: 'redmine', namespaces: ['redmine'] }] }, agentPreset: {}, tools: {},
    } };
    ctx.state.tools.registry.set('redmine.myIssues', { key: 'redmine.myIssues', module: 'redmine', name: 'myIssues', fn: 'redmine.myIssues', description: 'Issues', parameters: { type: 'object' } });
    for (const [name, fn] of Object.entries({ allows, origin, generation, compilePattern, coreCatalogue })) ctx.fns.agentPreset[name] = (opts: any) => fn(ctx, null, opts as never);
    ctx.fns.tools.list = () => list(ctx, null, {});
    const preset = defaults(ctx, null, {}).find(p => p.id === id)!;
    const snapshot: types.agentPreset.Snapshot = { presetId: preset.id, name: preset.name, layers: [{ id: preset.id, allow: preset.allow, deny: preset.deny, plugins: preset.plugins, prompt: preset.prompt, excludeSections: preset.exclude_sections }] };
    const agent = { preset: snapshot, tools } as types.agent.Agent;
    const names = () => wireTools(ctx, null, { agent }).map(t => t.name);
    return { ctx, agent, names };
}

describe('native tool preset filtering', () => {
    test('Standard hides mounted ungranted plugin tools', () => {
        const { names } = fixture();
        expect(names()).toEqual(['bash', 'edit', 'eval', 'grep', 'read', 'write']);
    });
    test('explicit tool selection narrows but cannot grant a plugin', () => {
        expect(fixture('standard', ['read']).names()).toEqual(['read']);
        expect(fixture('standard', ['read', 'myIssues']).names()).toEqual(['read']);
        expect(fixture('standard', []).names()).toHaveLength(6);
    });
    test('Minimal exposes exactly bash, read, write and edit, including fallback function names', () => {
        expect(fixture('minimal').names()).toEqual(['bash', 'edit', 'read', 'write']);
    });
    test('explicit implementation wins over declaration module and short name', () => {
        const { ctx, names } = fixture('minimal');
        ctx.state.tools.registry.set('tools.read', { key: 'tools.read', module: 'tools', name: 'read', fn: 'redmine.myIssues' });
        expect(names()).toEqual(['bash', 'edit', 'write']);
    });
    test('Creator and legacy agents retain all tools; completion receipts retain none', () => {
        const { ctx, agent, names } = fixture('creator');
        expect(names()).toContain('myIssues');
        agent.preset = undefined;
        expect(names()).toHaveLength(7);
        ctx.goalCompletionReport = true;
        expect(names()).toEqual([]);
    });
    test('selection accepts disambiguated wire names and short names', () => {
        const { ctx, agent, names } = fixture('creator', ['tools_read']);
        ctx.state.tools.registry.set('redmine.read', { key: 'redmine.read', module: 'redmine', name: 'read', fn: 'redmine.myIssues' });
        expect(names()).toEqual(['tools_read']);
        agent.tools = ['read'];
        expect(names()).toEqual(['redmine_read', 'tools_read']);
    });
});
