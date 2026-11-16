import { expect, test } from 'bun:test';
import stashResult from './stashResult';
import prepare from '../resultStore/prepare';

function harness(fail = false) {
    const writes: any[] = [];
    const ref: types.agent.ResultRef = { version: 1, id: '01900000-0000-7000-8000-000000000001', ownerAgentId: 'test', bytes: 7000, sha256: 'a'.repeat(64), kind: 'read' };
    const agent: any = { id: 'test', scratchpad: { note: 'unchanged' } };
    const ctx: any = { fns: { resultStore: { write: async (args: any) => {
        writes.push(args);
        if (fail) throw new Error('disk unavailable');
        return ref;
    } } } };
    ctx.fns.resultStore.prepare = (o: any) => prepare(ctx, null, o);
    return { ctx, writes, ref, agent, run: (output: string, kind = 'read') => stashResult(ctx, null, { agent, output, kind }) };
}

test('inline threshold includes exactly 6000 characters and never writes', async () => {
    const h = harness();
    for (const text of ['', 'short', 'x'.repeat(6000)]) expect(await h.run(text)).toEqual({ content: text });
    expect(h.writes).toHaveLength(0);
});

test('large single-line output is stored completely with a bounded useful head and UUID', async () => {
    const h = harness();
    const text = 'HEAD' + 'x'.repeat(7000) + 'TAIL';
    const r = await h.run(text);
    expect(h.writes).toEqual([{ ownerAgentId: 'test', kind: 'read', text }]);
    expect(r.result_ref).toEqual(h.ref);
    expect(r.content.startsWith(text.slice(0, 2500))).toBe(true);
    expect(r.content.length).toBeLessThan(3200);
    expect(r.content).toContain('await ctx.fns.agent.readResult({ id:');
    expect(r.content).toContain(h.ref.id);
    expect(r.content).not.toContain('scratchpad');
    expect(h.agent.scratchpad).toEqual({ note: 'unchanged' });
});

test('bash retains bounded tail, including for output without newlines', async () => {
    const h = harness();
    const text = 'HEAD' + 'x'.repeat(7000) + 'TAIL';
    const r = await h.run(text, 'bash');
    expect(r.content.endsWith(text.slice(-2500))).toBe(true);
    expect(r.content).toContain('tail preview');
});

test('storage failure is explicit, bounded and never claims a readable reference', async () => {
    const h = harness(true);
    for (const kind of ['read', 'bash']) {
        const r = await h.run('x'.repeat(7000), kind);
        expect(r.result_ref).toBeUndefined();
        expect(r.content).toContain('storage failed: disk unavailable');
        expect(r.content).toContain('NOT saved');
        expect(r.content).not.toContain('readResult(');
        expect(r.content.length).toBeLessThan(3200);
    }
});

test('a read result keeps its readId line in the preview even when the head is cut away', async () => {
    const h = harness();
    const head = 'readId: rabcdefgh · lines 1-900 of 900 · complete';
    const text = head + '\n' + 'y'.repeat(7000);
    const r = await h.run(text, 'read');
    expect(r.content.startsWith(head)).toBe(true);
    // bash keeps the tail, but a readId never appears there: nothing is prepended
    const b = await h.run('z'.repeat(7000), 'bash');
    expect(b.content).not.toContain('readId:');
});

test('read_result output stays inline up to its bounded maximum; other tools are still stored', async () => {
    const h = harness();
    const readTool = { wireName: 'read_result', name: 'read_result', fn: 'tools.readResult' };
    h.ctx.fns.tools = { list: () => [readTool] };
    const range = JSON.stringify({ ok: true, text: '"'.repeat(16000), totalChars: 50000, offset: 0, truncated: true });
    expect(range.length).toBeGreaterThan(16000);
    expect(await h.run(range, 'read_result')).toEqual({ content: range });
    expect(h.writes).toHaveLength(0);
    const other = await h.run('x'.repeat(16000), 'grep');
    expect(other.result_ref).toEqual(h.ref);
    expect(h.writes).toHaveLength(1);
});

test('preview hint names read_result only when the agent can call it', async () => {
    const h = harness();
    const readTool = { wireName: 'read_result', name: 'read_result', fn: 'tools.readResult' };
    h.ctx.fns.tools = { list: () => [readTool] };
    let wire: any[] = [{ name: 'read_result' }];
    h.ctx.fns.agent = { wireTools: () => wire };
    const native = await h.run('x'.repeat(7000), 'grep');
    expect(native.content).toContain(`read_result: { "id": "${h.ref.id}", "offset": 0, "limit": 4000 }`);
    expect(native.content).not.toContain('ctx.fns.agent.readResult');
    wire = [];
    const evalHint = await h.run('x'.repeat(7000), 'grep');
    expect(evalHint.content).toContain('await ctx.fns.agent.readResult({ id:');
});
