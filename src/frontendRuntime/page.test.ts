import { describe, expect, test } from 'bun:test';
import page from './page';

const request = (path: string, method = 'GET') => new Request(`http://localhost${path}`, { method });
const ctx = { fns: { frontendBridge: { proxy: async ({ req }: { req: Request }) => new Response(new URL(req.url).pathname + new URL(req.url).search) } } } as any;
const session = { user: { id: 'owner' } } as any;

describe('primary frontend document routing', () => {
    test('root serves Vite document preserving query', async () => {
        const result = await page(ctx, session, { req: request('/?agent=abc') });
        expect(await result!.text()).toBe('/ui-lab/?agent=abc');
    });
    test('legacy adapter keeps the old root and agent pages', async () => {
        const legacy = { ...session, legacyUi: true };
        expect(await page(ctx, legacy, { req: request('/') })).toBeUndefined();
        expect(await page(ctx, legacy, { req: request('/agent/abc') })).toBeUndefined();
    });
    test('deep links select the intended agent', async () => {
        for (const path of ['/agent/abc', '/a/abc']) {
            const result = await page(ctx, session, { req: request(path + '?view=stats') });
            expect(result!.status).toBe(307);
            expect(result!.headers.get('location')).toBe('/?view=stats&agent=abc');
        }
    });
    test('API, new-agent form and mutations retain their handlers', async () => {
        for (const path of ['/agent/new', '/agent/abc/queue', '/api/v1/agents', '/old-ui/']) {
            expect(await page(ctx, session, { req: request(path) })).toBeUndefined();
        }
        expect(await page(ctx, session, { req: request('/agent/abc', 'POST') })).toBeUndefined();
    });
    test('HTML document links the brand favicon, apple-touch icon and manifest at server routes, with or without a CSRF token', async () => {
        for (const token of ['tok"en', null]) {
            const html = { fns: { auth: { csrfToken: async () => token }, frontendBridge: { proxy: async () => new Response('<html><head><title>x</title></head></html>', { headers: { 'content-type': 'text/html' } }) } } } as any;
            const text = await (await page(html, session, { req: request('/') }))!.text();
            expect(text).toContain('<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/ui/app-icon?size=180"><link rel="manifest" href="/ui/manifest.webmanifest">');
            expect(text.includes('<meta name="csrf-token" content="tok&quot;en">')).toBe(token !== null);
        }
    });
    test('anonymous deep link cannot skip authentication', async () => {
        expect((await page(ctx, null, { req: request('/agent/abc') }))!.status).toBe(401);
    });
});
