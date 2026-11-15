import { describe, expect, mock, test } from 'bun:test';
import call from './call';
import allows from '../agentPreset/allows';
import origin from '../agentPreset/origin';
import generation from '../agentPreset/generation';
import compilePattern from '../agentPreset/compilePattern';
import defaults from '../agentPreset/defaults';
import coreCatalogue from '../agentPreset/coreCatalogue';

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
    for (const [name, fn] of Object.entries({ allows, origin, generation, compilePattern, coreCatalogue })) ctx.fns.agentPreset[name] = (opts: any) => fn(ctx, null, opts as never);
    const standard = defaults(ctx, null, {}).find(p => p.id === 'standard')!;
    const preset: types.agentPreset.Snapshot = { presetId: standard.id, name: standard.name, layers: [{ id: standard.id, allow: standard.allow, deny: standard.deny, plugins: standard.plugins, prompt: standard.prompt, excludeSections: standard.exclude_sections }] };
    return { ctx, tool, handler, validate, customValidate, beginRun, agent: { preset } as types.agent.Agent };
}

describe('tool call preset guard', () => {
    test('hidden Redmine tool is denied before either validator or handler executes', async () => {
        const { ctx, agent, handler, validate, customValidate, beginRun } = fixture();
        for (const name of ['myIssues', 'redmine.myIssues']) {
            expect(await call(ctx, null, { name, agent, args: 'invalid' })).toEqual({
                output: 'Error: redmine.myIssues is not available in preset Standard', isError: true, handlerExecuted: false,
            });
        }
        for (const spy of [handler, validate, customValidate, beginRun]) expect(spy).not.toHaveBeenCalled();
    });
    test('wire aliases and declarations without explicit fn use the same guard', async () => {
        const { ctx, tool, agent } = fixture();
        tool.wireName = 'redmine_issues';
        Reflect.deleteProperty(tool, 'fn');
        const result = await call(ctx, null, { name: 'redmine_issues', agent });
        expect(result.output).toBe('Error: redmine.myIssues is not available in preset Standard');
        expect(result.handlerExecuted).toBe(false);
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
