import { expect, test } from 'bun:test';
import rootSSE from '../parseSSE';
import leafSSE from './parseSSE';
import leafFetch from './fetch';
import leafValidate from './validateTransport';

for (const [name, parse] of [['root', rootSSE], ['leaf', leafSSE]] as const) {
    test(`${name} SSE preserves streaming event boundaries and generator cancellation`, async () => {
        const ctx = { fns: { models: { transport: { parseSSE: (opts: Parameters<typeof leafSSE>[2]) => leafSSE(ctx as Context, null, opts) } } } };
        const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('event: update\ndata: hello\ndata: world\n\ndata: done\n\n')); c.close(); } });
        const events = [];
        const iterator = parse(ctx as Context, null, { body });
        expect(typeof iterator.next).toBe('function');
        for await (const event of iterator) events.push(event);
        expect(events).toEqual([{ event: 'update', data: 'hello\nworld' }, { event: null, data: 'done' }]);
        expect(body.locked).toBe(false);
    });
}

test('transport leaves reject invalid destinations and unsupported transport before IO', async () => {
    const ctx = { fns: {} } as Context;
    await expect(leafFetch(ctx, null, { transport: { kind: 'direct' }, url: 'https://user:password@example.invalid' })).rejects.toThrow();
    await expect(leafValidate(ctx, null, { transport: { kind: 'direct' }, allowed: ['socks'] })).rejects.toThrow();
});
