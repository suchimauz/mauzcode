import { expect, test } from 'bun:test';
import { mkTestCtx } from '../../_testCtx.entry';

test('bounded reader never classifies or exposes a truncated prefix', async () => {
    const ctx = await mkTestCtx();
    const captured: string[] = [];
    const read = (response: Response) => ctx.fns.models.inference.readErrorBody({ response, captureText: (s: string) => { captured.push(s); } });
    const json = JSON.stringify({ message: 'OK' });
    expect(await read(new Response(json.padEnd(16384)))).toEqual({ message: 'OK' });
    expect(captured.pop()?.length).toBe(16384);
    expect(await read(new Response(json.padEnd(16385)))).toBeNull();
    expect(captured).toHaveLength(0);
    expect(await read(new Response('Not JSON'))).toBeNull();
    expect(captured).toEqual(['Not JSON']);
});

test('inference transport retains retry classification, not the underlying exception or address', async () => {
    const ctx = await mkTestCtx();
    const raw = Object.assign(new Error('sensitive proxy address', {cause: Object.assign(new Error('sensitive transport info'), {code: 'ECONNRESET'})}), {code: 'TRANSPORT', retryable: false, noFallback: true});
    const conn = {provider: 'custom', fetch: async () => { throw raw; }} as unknown as types.models.ResolvedConnection;
    const controller = new AbortController();
    ctx.fns.models.inference.watchTransport({conn, signal: controller.signal});
    const run = () => conn.fetch('https://private.invalid').then(() => null, e => e);
    const err = await run();
    expect(err).toMatchObject({code: 'TRANSPORT', retryable: false, noFallback: true, diagnostic: {provider:'custom', stage:'transport',code:'ECONNRESET'}});
    expect(err.failure).toBeUndefined();
    expect(err.cause).toBeUndefined();
    expect(err.message).toContain('no response');
    expect(JSON.stringify(err)).not.toMatch(/sensitive|private\.invalid/);
    controller.abort();
    expect(await run()).toBe(raw);
});
