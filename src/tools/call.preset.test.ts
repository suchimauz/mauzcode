import { describe, expect, mock, test } from 'bun:test';
import call from './call';
import allows from '../agentPreset/allows';
import origin from '../agentPreset/origin';
import generation from '../agentPreset/generation';
import compilePattern from '../agentPreset/compilePattern';
import defaults from '../agentPreset/defaults';
import coreCatalogue from '../agentPreset/coreCatalogue';
import predicate from '../agentPreset/predicate';
import permitted from './permitted';
import requirements from './requirements';

function fixture() {
    const handler = mock(() => 'should not execute');
    const validate = mock(() => ({ ok: false, errors: ['invalid test arguments'] }));
    const customValidate = mock(() => []);
    const beginRun = mock(() => { throw new Error('must not begin a run'); });
    const tool = { key: 'redmine.myIssues', module: 'redmine', name: 'myIssues', wireName: 'myIssues', fn: 'redmine.myIssues', validate: 'redmine.validate', parameters: { type: 'object' } };
    const ctx: any = { state: { registry: {}, procs: { boot: {} } }, fns: {
        plugins: { list: () => [{ name: 'redmine', namespaces: ['redmine'] }] }, agentPreset: {},
        tools: { list: () => [tool], validate, beginRun }, redmine: { myIssues: handler, validate: customValidate },
    } };
    for (const [name, fn] of Object.entries({ allows, origin, generation, compilePattern, coreCatalogue, predicate })) ctx.fns.agentPreset[name] = (opts: any) => fn(ctx, null, opts as never);
    ctx.fns.tools.permitted = (opts: any) => permitted(ctx, null, opts);
    ctx.fns.tools.requirements = (opts: any) => requirements(ctx, null, opts);
    const standard = defaults(ctx, null, {}).find(p => p.id === 'standard')!;
    const preset: types.agentPreset.Snapshot = { presetId: standard.id, name: standard.name, layers: [{ id: standard.id, allow: standard.allow, deny: standard.deny, plugins: standard.plugins, prompt: standard.prompt, excludeSections: standard.exclude_sections }] };
    return { ctx, tool, handler, validate, customValidate, beginRun, agent: { preset } as types.agent.Agent };
}

describe('tool call preset guard', () => {
    test('hidden Redmine tool is denied before either validator or handler executes', async () => {
        const { ctx, agent, handler, validate, customValidate, beginRun } = fixture();
        for (const name of ['myIssues', 'redmine.myIssues']) {
            expect(await call(ctx, null, { name, agent, args: 'invalid' })).toEqual({
                output: `Error: unknown tool "${name}". Available: `, isError: true, handlerExecuted: false,
            });
        }
        for (const spy of [handler, validate, customValidate, beginRun]) expect(spy).not.toHaveBeenCalled();
    });
    test('wire aliases and declarations without explicit fn use the same guard', async () => {
        const { ctx, tool, agent } = fixture();
        tool.wireName = 'redmine_issues';
        Reflect.deleteProperty(tool, 'fn');
        const result = await call(ctx, null, { name: 'redmine_issues', agent });
        expect(result.output).toBe('Error: unknown tool "redmine_issues". Available: ');
        expect(result.handlerExecuted).toBe(false);
    });
    test('denied and nonexistent tools give the same error without denied tool, function or preset names', async () => {
        const { ctx, agent, tool } = fixture();
        const read = { key: 'tools.read', module: 'tools', name: 'read', wireName: 'read', fn: 'tools.read', parameters: { type: 'object' } };
        ctx.fns.tools.list = () => [read, tool];
        const denied = await call(ctx, null, { name: 'myIssues', agent });
        const missing = await call(ctx, null, { name: 'nopeTool', agent });
        expect(denied.output).toBe('Error: unknown tool "myIssues". Available: read');
        expect(missing.output).toBe('Error: unknown tool "nopeTool". Available: read');
        for (const text of [denied.output, missing.output]) expect(text).not.toMatch(/redmine|Standard|preset/);
    });
    test('requires denies a tool whose wrapped capability is denied, even if its adapter is allowed', async () => {
        const { ctx, agent, handler } = fixture();
        agent.preset!.layers[0]!.plugins = ['redmine'];
        const wrapped = { key: 'tools.wrap', module: 'tools', name: 'wrap', wireName: 'wrap', fn: 'redmine.myIssues', requires: ['procs.db.select'], parameters: { type: 'object' } };
        ctx.fns.tools.list = () => [wrapped];
        expect((await call(ctx, null, { name: 'wrap', agent })).output).toBe('Error: unknown tool "wrap". Available: ');
        // Allowed adapter and capability pass the guard and reach argument validation.
        wrapped.requires = ['redmine.validate'];
        expect((await call(ctx, null, { name: 'wrap', agent })).output).toContain('invalid arguments for wrap');
        // Malformed requires fails closed.
        for (const bad of ['redmine.validate', [''], [1]] as any[]) {
            wrapped.requires = bad;
            expect((await call(ctx, null, { name: 'wrap', agent })).output).toBe('Error: unknown tool "wrap". Available: ');
        }
        expect(handler).not.toHaveBeenCalled();
    });
    test('allowed agents and calls without a snapshot retain normal validation', async () => {
        for (const mode of ['granted', 'legacy', 'no-agent']) {
            const { ctx, agent, validate } = fixture();
            if (mode === 'granted') agent.preset!.layers[0]!.plugins = ['redmine'];
            if (mode === 'legacy') agent.preset = undefined;
            const result = await call(ctx, null, { name: 'myIssues', agent: mode === 'no-agent' ? undefined : agent });
            expect(result.output).toContain('invalid arguments');
            expect(validate).toHaveBeenCalledTimes(1);
        }
    });
});
