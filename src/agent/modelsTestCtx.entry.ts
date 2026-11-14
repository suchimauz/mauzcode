// Test-only neutral provider facade. Never requests a real provider.
import { mkTestCtx } from '../_testCtx.entry';
export async function mkModelsTestCtx() {
    const ctx = await mkTestCtx();
    const resolve = ctx.state.registry.models.resolveRoute;
    ctx.state.registry.models.resolveRoute = async (c: any, s: any, o: any) => {
        if (!o.route.startsWith('mock/')) return resolve(c, s, o);
        const slash = o.route.indexOf('/'), colon = o.route.indexOf(':', slash + 1);
        if (colon <= slash + 1 || colon === o.route.length - 1) throw Error('INVALID_ROUTE');
        return { route: o.route, provider: 'mock', accountName: o.route.slice(slash + 1, colon), modelId: o.route.slice(colon + 1), model: o.route.slice(colon + 1), connectionId: o.route.slice(0, colon), nativeCompaction: false };
    };
    ctx.state.registry.models.listModels = async () => ({ models: [{ id: 'test', reasoning: { supported: ['low', 'medium', 'high'], default: 'medium' } }], source: 'manual', cachedAt: null });
    ctx.state.registry.models.stream = async (c: any, _s: any, o: any) => {
        o.signal?.throwIfAborted();
        const agent = c.state.agent[o.sessionId];
        if (!agent || !o.connectionId.startsWith('mock/')) throw Error('Test attempted real provider');
        const cfg = agent.scratchpad.mockLLM ?? {};
        const n = Number(agent.scratchpad.mockTurn ?? 0);
        agent.scratchpad.mockTurn = n + 1;
        const turn = cfg.turns?.[n];
        const toolCalls = (turn?.toolCalls ?? []).map((call: any, i: number) => ({ id: call.id ?? `call_${n}_${i}`, name: call.name, args: call.args ?? {} }));
        const last = o.messages.at(-1);
        const text = turn ? String(turn.text ?? '') : Array.isArray(cfg.turns) ? String(cfg.defaultText ?? 'done') : last?.role === 'user' ? cfg.echoUser ? String(last.content ?? '') : String(cfg.userText ?? 'ok') : String(cfg.defaultText ?? 'ok');
        return { text, thinking: '', finishReason: toolCalls.length ? 'tool_calls' : 'stop', toolCalls, usage: { prompt_tokens: o.messages.length, completion_tokens: 1 } };
    };
    return ctx;
}
