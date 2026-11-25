import { expect, test } from 'bun:test';
import sync from './syncPlanningContext';
import build from './buildLlmRequest';
import project from '../compaction/project';
import portable from '../compaction/portable';
import normalize from './normalizeSleepContext';
import generation from './getSleepGeneration';

type Row = types.session.Message;
const mode = (content = 'execute'): Row => ({ role: 'user', message_type: 'planning_context', excluded_from_cursor: true, content });
const turn = (content: string): Row => ({ role: 'user', content });

function fixture() {
    const inherited: Row[] = [mode(), turn('already summarized')];
    const own: Row[] = [turn('retained task')];
    const gen = { revision: 2, model: 'mock/work:model', sourceOffset: 2, tailStart: 2, contextMessages: [turn('checkpoint')] };
    const sleep = { mode: 'compact', activeRevision: 2, generations: [gen] };
    const history = () => [...inherited, ...own];
    const agent: types.agent.Agent = {
        id: 'fork', title: '', parentId: 'parent', model: gen.model, messages: history(), sleepContext: sleep,
        icon: null, workspaceDir: '', systemPrompt: '', events: [], cursors: {}, subscribers: new Set(),
        waiters: [], isStreaming: false, abortController: null, scratchpad: {},
    };
    const ctx: any = { fns: {
        planning: { prompt: async () => 'execute' },
        session: { getFullMessages: history, appendMessage: async ({ id, message }: any) => { expect(id).toBe('fork'); own.push(message); },
            syncAgentState: async () => { agent.messages = history(); }, repairToolPairs: ({ messages }: any) => ({ messages, repaired: [] }) },
        agent: { normalizeSleepContext: (o: any) => normalize(ctx, null, o), getSleepGeneration: (o: any) => generation(ctx, null, o),
            requireModel: () => gen.model, fullSystemPrompt: async () => 'bootstrap', selectJevContext: async ({ messages }: any) => messages },
        compaction: { project: (o: any) => project(ctx, null, o), portable: (o: any) => portable(ctx, null, o) },
        auth: { attributeMessages: ({ messages }: any) => ({ messages, applied: false }) },
        attachments: { resolveContent: ({ messages }: any) => messages }, models: { resolveRoute: () => ({}) },
    } };
    return { agent, own, inherited, gen, sleep, ctx, sync: () => sync(ctx, null, { agent }), build: () => build(ctx, null, { agent, preview: true }) };
}

test('a dropped mode row is restored once to the fork; subsequent requests extend the exact prefix', async () => {
    const f = fixture();
    const before = await f.build();
    expect(before.messages.slice(before.cacheableMessageCount).map(m => m.content)).toEqual(['execute']);
    expect(f.own).toHaveLength(1); // preview cannot fix the durable transcript
    expect((await f.sync()).appended).toBe(true);
    expect(f.own.at(-1)).toEqual(mode());
    expect(f.inherited).toHaveLength(2);
    const first = await f.build();
    expect(first.messages).toHaveLength(first.cacheableMessageCount);
    f.own.push({ role: 'assistant', content: 'ok' }, turn('next'));
    expect((await f.sync()).reason).toBe('unchanged');
    const second = await f.build();
    expect(second.messages).toEqual([...first.messages, { role: 'assistant', content: 'ok' }, turn('next')]);
    expect(second.messages).toHaveLength(second.cacheableMessageCount);
});

test('matching guidance in the checkpoint, retained tail or full-history fallback needs no write', async () => {
    for (const where of ['checkpoint', 'tail', 'fallback', 'full']) {
        const f = fixture();
        if (where === 'checkpoint') f.gen.contextMessages.push(mode());
        if (where === 'tail') f.gen.tailStart = 0;
        if (where === 'fallback') f.sleep.activeRevision = 99;
        if (where === 'full') f.sleep.mode = 'full';
        expect((await f.sync()).reason).toBe('unchanged');
        expect(f.own).toHaveLength(1);
    }
});

test('outdated checkpoint guidance is replaced, even if canonical history already matches', async () => {
    const f = fixture(); f.gen.contextMessages.push(mode('plan'));
    expect((await f.sync()).reason).toBe('changed');
    expect((await f.sync()).reason).toBe('unchanged');
    expect(f.own.filter(m => m.message_type === 'planning_context')).toEqual([mode()]);
});

test('guidance waits for all results of the trailing tool batch', async () => {
    const f = fixture(); const calls = ['a', 'b'].map(id => ({ id, name: 'read', args: {} }));
    f.own.push({ role: 'assistant', tool_calls: calls }); f.agent.messages = [...f.inherited, ...f.own];
    expect((await f.sync()).reason).toBe('tool_call_tail');
    f.own.push({ role: 'tool', tool_call_id: 'b', content: 'ok' }); f.agent.messages = [...f.inherited, ...f.own];
    expect((await f.sync()).reason).toBe('tool_call_tail');
    f.own.push({ role: 'tool', tool_call_id: 'a', content: 'ok' }); f.agent.messages = [...f.inherited, ...f.own];
    expect((await f.sync()).appended).toBe(true);
});
