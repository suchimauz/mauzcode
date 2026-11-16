import { describe, expect, test } from 'bun:test';
import { mkModelsTestCtx } from './modelsTestCtx.entry';

describe('supported test fixture contracts', () => {
    test('base stubs and raw registry overrides work through the real Proxy', async () => {
        const ctx = await mkModelsTestCtx();
        expect(await ctx.fns.markdown.highlight({ code: '<x>&' })).toBe('&lt;x&gt;&amp;');
        expect(await ctx.fns.markdown.render({ source: '**raw**' })).toBe('**raw**');
        expect(await ctx.fns.repl.eval({ code: '2+2' })).toBe(4);
        expect(ctx.env.NODE_ENV).toBe('test');
        const original = ctx.state.registry.markdown.render;
        try {
            ctx.state.registry.markdown.render = async (rawCtx: unknown, _session: unknown, opts: { source: string }) => {
                expect(rawCtx).toBe(ctx);
                return `override:${opts.source}`;
            };
            expect(await ctx.fns.markdown.render({ source: 'probe' })).toBe('override:probe');
        } finally {
            ctx.state.registry.markdown.render = original;
        }
        const response = await ctx.fns.procs.http.dispatch({ method: 'GET', url: '/__fixture_contract_missing__', headers: { accept: 'application/json' } });
        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(404);
        expect(await response.text()).toBe('Not Found');
    });

    test('mock facade resolves account/model routes and emits deterministic turns without providers', async () => {
        const ctx = await mkModelsTestCtx();
        expect(await ctx.fns.models.resolveRoute({ route: 'mock/default:test' })).toMatchObject({
            provider: 'mock', accountName: 'default', modelId: 'test', connectionId: 'mock/default', nativeCompaction: false,
        });
        for (const route of ['mock/test', 'mock/:test', 'mock/default:']) {
            await expect(ctx.fns.models.resolveRoute({ route })).rejects.toThrow('INVALID_ROUTE');
        }
        expect(await ctx.fns.models.listModels({ connectionId: 'mock/default' })).toMatchObject({ models: [{ id: 'test' }], source: 'manual' });
        const agent = await ctx.fns.agent.start({ model: 'mock/default:test' });
        const stream = (connectionId = 'mock/default', sessionId = agent.id) => ctx.fns.models.stream({
            connectionId, sessionId, model: 'test', messages: [{ role: 'user', content: 'hello' }],
        });
        agent.scratchpad.mockLLM = { echoUser: true };
        expect(await stream()).toMatchObject({ text: 'hello', finishReason: 'stop', toolCalls: [] });
        agent.scratchpad.mockTurn = 0;
        agent.scratchpad.mockLLM = { turns: [{ toolCalls: [{ name: 'read' }] }, { text: 'answer' }], defaultText: 'finished' };
        expect(await stream()).toMatchObject({ text: '', finishReason: 'tool_calls', toolCalls: [{ id: 'call_0_0', name: 'read', args: {} }] });
        expect(await stream()).toMatchObject({ text: 'answer', finishReason: 'stop' });
        expect(await stream()).toMatchObject({ text: 'finished', finishReason: 'stop' });
        expect(agent.scratchpad.mockTurn).toBe(3);
        await expect(stream('real/default')).rejects.toThrow('Test attempted real provider');
        await expect(stream('mock/default', '__missing__')).rejects.toThrow('Test attempted real provider');
    });
});
