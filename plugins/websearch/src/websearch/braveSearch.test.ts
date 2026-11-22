import { afterEach, describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import scan from '../../../../src/procs/project/scan';
import { sdkCtx } from './sdkFixture.entry';

const KEY = 'BSA-fixture-key-0123456789';
const originalFetch = globalThis.fetch;
const originalTimer = globalThis.setTimeout;
afterEach(() => { globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimer; });
function mockFetch(fn: (url: URL, init?: RequestInit) => Promise<Response> | Response) {
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    globalThis.fetch = ((input: URL | string, init?: RequestInit) => {
        const url = new URL(String(input)); calls.push({ url, init }); return Promise.resolve(fn(url, init));
    }) as typeof fetch;
    return calls;
}
const brave = (key: string | null = KEY) => sdkCtx({ braveKey: key, settings: { defaultEngine: 'brave' } });
const run = (limit?: number) => brave().fns.websearch.search({ query: 'bun runtime', ...(limit ? { limit } : {}) });
const failure = async (limit?: number) => {
    try { await run(limit); return ''; } catch (error) { return String((error as Error).message); }
};

describe('brave provider (mocked fetch)', () => {
    test('request params, header, count clamp and no redirects', async () => {
        const calls = mockFetch(() => Response.json({ web: { results: [] } }));
        const found = await run(50);
        expect(found).toMatchObject({ engine: 'brave', results: [] });
        expect(calls).toHaveLength(1);
        const { url, init } = calls[0];
        expect(url.origin + url.pathname).toBe('https://api.search.brave.com/res/v1/web/search');
        expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'bun runtime', count: '20', extra_snippets: 'true' });
        expect(url.href).not.toContain(KEY);
        expect(init?.headers).toEqual({ Accept: 'application/json', 'X-Subscription-Token': KEY });
        expect(init?.redirect).toBe('error');
        expect(init?.method ?? 'GET').toBe('GET');
    });
    test('rich result mapping', async () => {
        mockFetch(() => Response.json({ web: { results: [{
            title: 'Bun', url: 'https://bun.sh/', description: 'A <strong>fast</strong> runtime', page_age: '2024-05-01T10:00:00',
            age: '2 days ago', language: 'en', profile: { name: 'Bun' }, extra_snippets: ['One', 'Two'],
        }] } }));
        const [result] = (await run()).results;
        expect(result).toEqual({
            title: 'Bun', url: 'https://bun.sh/', description: 'A fast runtime', descriptionHtml: 'A <strong>fast</strong> runtime',
            publishedAt: new Date('2024-05-01T10:00:00').toISOString(), language: 'en', site: 'Bun', extraSnippets: ['One', 'Two'],
        });
    });
    test('plan without extra snippets and only a human age', async () => {
        mockFetch(() => Response.json({ web: { results: [{ title: 'T', url: 'https://t.test/', age: '2 days ago' }] } }));
        const [result] = (await run()).results;
        expect(result.extraSnippets).toEqual([]); expect(result.publishedAt).toBeNull();
        expect(result.descriptionHtml).toBeNull(); expect(result.site).toBeNull();
    });
    test('missing web.results is invalid response shape; non-JSON too', async () => {
        mockFetch(() => Response.json({ query: {} }));
        expect(await failure()).toBe('websearch.search: brave: invalid response shape');
        mockFetch(() => new Response('<html>'));
        expect(await failure()).toBe('websearch.search: brave: invalid response shape');
    });
    for (const [status, message] of [[401, 'invalid API key'], [403, 'invalid API key'], [429, 'rate limited'], [500, 'HTTP 500']] as const) {
        test(`HTTP ${status} → ${message} without body or key`, async () => {
            mockFetch(() => new Response(`SECRET BODY ${KEY}`, { status }));
            const message_ = await failure();
            expect(message_).toBe(`websearch.search: brave: ${message}`);
            expect(message_).not.toContain(KEY); expect(message_).not.toContain('SECRET');
        });
    }
    test('timeout aborts after 10 seconds', async () => {
        const delays: number[] = [];
        globalThis.setTimeout = ((fn: () => void, ms?: number) => { delays.push(ms ?? 0); return originalTimer(fn, 5); }) as typeof setTimeout;
        const signals: AbortSignal[] = [];
        mockFetch((_url, init) => { signals.push(init!.signal!); return new Promise(() => {}); });
        expect(await failure()).toBe('websearch.search: brave: request timed out');
        expect(delays).toContain(10_000); expect(signals[0].aborted).toBe(true);
    });
    test('transport error is request failed and never leaks key or URL', async () => {
        mockFetch(() => { throw new Error(`connect https://api.search.brave.com/?q=x token=${KEY}`); });
        const message = await failure();
        expect(message).toBe('websearch.search: brave: request failed');
        expect(message).not.toContain(KEY); expect(message).not.toContain('api.search.brave.com');
    });
    test('the plugin registers Brave search and status, but no function to return its key', async () => {
        const root = { name: 'websearch', dir: fileURLToPath(new URL('../', import.meta.url)) };
        const ctx = { fns: { procs: { modules: { discover: async () => [root] } } } } as unknown as Context;
        const handlers = (await scan(ctx, null, {})).filter(e => e.module === 'websearch' && e.kind === 'fn').map(e => e.runtimeName);
        expect(handlers).toContain('braveSearch');
        expect(handlers).toContain('braveStatus');
        expect(handlers).not.toContain('braveApiKey');
    });
    test('secret resolution errors do not escape status or direct search', async () => {
        const ctx = brave();
        ctx.registry.secrets.resolveSetting = async () => { throw new Error(KEY); };
        const calls = mockFetch(() => Response.json({}));
        expect(await ctx.fns.websearch.braveStatus({})).toEqual({ configured: false, reason: 'API key not set' });
        await expect(ctx.fns.websearch.braveSearch({ query: 'bun', limit: 1 })).rejects.toThrow(/^API key not set$/);
        expect(calls).toHaveLength(0);
    });
    test('status is configured only with a key', async () => {
        expect(await brave().fns.websearch.braveStatus({})).toEqual({ configured: true });
        expect(await brave(null).fns.websearch.braveStatus({})).toEqual({ configured: false, reason: 'API key not set' });
        expect(JSON.stringify(await brave().fns.websearch.providers({}))).not.toContain(KEY);
    });
});
