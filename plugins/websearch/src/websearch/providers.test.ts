import { afterEach, describe, expect, test } from 'bun:test';
import load from './$loader_websearchProvider';
import { sdkCtx } from './sdkFixture.entry';

const originalTimeout = AbortSignal.timeout;
afterEach(() => { AbortSignal.timeout = originalTimeout; });
/** Makes the 2 s status bound fire at once and records the requested delays. */
function fastStatusBound() {
    const delays: number[] = [];
    AbortSignal.timeout = ((ms: number) => { delays.push(ms); return originalTimeout.call(AbortSignal, 5); }) as typeof AbortSignal.timeout;
    return delays;
}

const declaration = (patch: Record<string, unknown> = {}) => ({
    apiVersion: 1, label: 'Acme', description: 'Acme search', handlers: { search: 'acme.search', status: 'acme.status' }, ...patch,
});
function entry(root = 'acme', name = 'acme-search', def: unknown = declaration()) {
    return {
        kind: 'websearchProvider', root, rootDir: `/mounted/${root}/src`,
        abs: `/mounted/${root}/src/acme/$websearchProvider_${name}.ts`,
        rel: `acme/$websearchProvider_${name}.ts`, moduleDir: 'acme', name, mod: { default: def },
    };
}
function loaderCtx(boot: ReturnType<typeof entry>[] = [], roots: Record<string, string[]> = { websearch: ['websearch'], acme: ['acme'], beta: ['beta'] }) {
    const warnings: string[] = [];
    const ctx = {
        state: { websearch: {} as types.websearch.State, procs: { boot: { entries: boot } } },
        warnings,
        fns: { procs: {
            modules: { list: () => Object.entries(roots).map(([name, namespaces]) => ({ name, dir: `/mounted/${name}`, namespaces })) },
            log: { debug() {}, warn: (r: { event: string; msg: string }) => { warnings.push(`${r.event} ${r.msg}`); } },
        } },
    };
    return ctx;
}
const register = (ctx: ReturnType<typeof loaderCtx>, ...entries: ReturnType<typeof entry>[]) => load(ctx as unknown as Context, null, { entries });
const ids = (ctx: ReturnType<typeof loaderCtx>) => Object.keys(ctx.state.websearch.providers ?? {}).sort();

describe('websearchProvider loader', () => {
    test('valid declaration registers with owner, handlers and settings', async () => {
        const ctx = loaderCtx();
        const r = await register(ctx, entry('acme', 'acme-search', declaration({ settings: ['acme.apiKey'] })));
        expect(r).toEqual({ registered: ['acme-search'], rejected: [] });
        expect(ctx.state.websearch.providers!['acme-search']).toMatchObject({
            id: 'acme-search', owner: 'acme', label: 'Acme', handlers: { search: 'acme.search', status: 'acme.status' }, settings: ['acme.apiKey'],
        });
    });
    test('broken declaration is isolated with a fixed diagnostic naming its file', async () => {
        const ctx = loaderCtx();
        const r = await register(ctx, entry('acme', 'broken', declaration({ handlers: {} })), entry());
        expect(r.registered).toEqual(['acme-search']);
        expect(r.rejected).toEqual([{ rel: 'acme/$websearchProvider_broken.ts', message: 'websearchProvider requires handlers.search' }]);
        expect(ctx.warnings[0]).toStartWith('websearch.provider.rejected acme/$websearchProvider_broken.ts');
    });
    test('invalid ids and shapes are rejected', async () => {
        const ctx = loaderCtx();
        const throwing = { get apiVersion() { throw new Error('SECRET'); } };
        const r = await register(ctx, entry('acme', 'Bad_Id'), entry('acme', 'v2', declaration({ apiVersion: 2 })),
            entry('acme', 'nolabel', declaration({ label: '' })), entry('acme', 'getter', throwing),
            entry('acme', 'extra', declaration({ handlers: { search: 'acme.search', run: 'acme.run' } })));
        expect(r.registered).toEqual([]);
        expect(r.rejected.map(d => d.message)).toEqual([
            'websearchProvider id must be lowercase kebab-case', 'websearchProvider apiVersion must be 1',
            'websearchProvider requires a label of at most 100 characters', 'websearchProvider declaration failed to load',
            'websearchProvider handlers allow only search and status',
        ]);
        expect(JSON.stringify(r)).not.toContain('SECRET');
    });
    test('duplicate id keeps the first registration', async () => {
        const ctx = loaderCtx();
        const r = await register(ctx, entry('acme'), { ...entry('beta', 'acme-search', declaration({ handlers: { search: 'beta.search' } })) });
        expect(r.registered).toEqual(['acme-search']);
        expect(r.rejected[0].message).toBe('websearchProvider acme-search already belongs to acme (acme/$websearchProvider_acme-search.ts)');
        expect(ctx.state.websearch.providers!['acme-search'].owner).toBe('acme');
    });
    test('foreign handler is rejected', async () => {
        const ctx = loaderCtx();
        const r = await register(ctx, entry('acme', 'acme-search', declaration({ handlers: { search: 'websearch.braveSearch' } })),
            entry('acme', 'acme-two', declaration({ handlers: { search: 'acme.search', status: 'settings.list' } })));
        expect(r.registered).toEqual([]);
        expect(r.rejected.map(d => d.message)).toEqual(Array(2).fill('websearchProvider handler must belong to the declaring module'));
    });
    test('handler existence is not required at registration', async () => {
        const ctx = loaderCtx();
        expect((await register(ctx, entry())).registered).toEqual(['acme-search']);
    });
    test('unmounting the owner removes its providers; a full pass drops deleted files', async () => {
        const acme = entry(); const other = entry('acme', 'acme-two');
        const ctx = loaderCtx([acme, other]);
        await register(ctx, acme, other);
        expect(ids(ctx)).toEqual(['acme-search', 'acme-two']);
        ctx.state.procs.boot.entries = [acme];
        await register(ctx, acme);
        expect(ids(ctx)).toEqual(['acme-search']);
        const unmounted = loaderCtx([], { websearch: ['websearch'] });
        unmounted.state.websearch = ctx.state.websearch;
        await register(unmounted);
        expect(ids(unmounted)).toEqual([]);
    });
    test('an entry without a mounted owner is rejected', async () => {
        const ctx = loaderCtx();
        const r = await register(ctx, { ...entry(), root: undefined as unknown as string, rootDir: undefined as unknown as string });
        expect(r.rejected[0].message).toBe('websearchProvider requires a mounted source owner');
    });
});

/** Adds a third-party `acme-search` provider with replaceable handlers to the SDK fixture. */
function withAcme(handlers: { search?: (o: unknown) => unknown; status?: (o: unknown) => unknown } = {}, patch: Partial<types.websearch.ProviderEntry> = {}) {
    const ctx = sdkCtx();
    const calls: string[] = [];
    ctx.registry.acme = {
        ...(handlers.search ? { search: (_c, _s, o) => { calls.push('search'); return handlers.search!(o); } } : {}),
        ...(handlers.status ? { status: (_c, _s, o) => { calls.push('status'); return handlers.status!(o); } } : {}),
    };
    ctx.state.websearch!.providers!['acme-search'] = {
        id: 'acme-search', owner: 'acme', rel: 'acme/$websearchProvider_acme-search.ts', abs: '/acme.ts', label: 'Acme',
        description: 'Acme search', handlers: { search: 'acme.search', ...(handlers.status ? { status: 'acme.status' } : {}) }, settings: ['acme.apiKey'], ...patch,
    };
    return { ctx, calls };
}

describe('websearch.providers / providerIds', () => {
    test('lists providers with status, default first; brave without key is not configured', async () => {
        const ctx = sdkCtx();
        const list = await ctx.fns.websearch.providers({});
        expect(list.map(p => p.id)).toEqual(['google-browser', 'brave', 'openserp']);
        expect(list[0]).toMatchObject({ id: 'google-browser', isDefault: true, configured: true, owner: 'websearch' });
        expect(list.find(p => p.id === 'brave')).toMatchObject({ configured: false, reason: 'API key not set', isDefault: false });
        expect(await ctx.fns.websearch.providerIds({})).toEqual(['brave', 'google-browser', 'openserp']);
    });
    test('throwing, slow and missing status/search handlers mark only that provider', async () => {
        const delays = fastStatusBound();
        const throwing = withAcme({ search: () => ({ results: [] }), status: () => { throw new Error('SECRET'); } });
        expect((await throwing.ctx.fns.websearch.providers({})).find(p => p.id === 'acme-search')).toMatchObject({ configured: false, reason: 'status check failed' });
        const slow = withAcme({ search: () => ({ results: [] }), status: () => new Promise(() => {}) });
        const list = await slow.ctx.fns.websearch.providers({});
        expect(list.find(p => p.id === 'acme-search')).toMatchObject({ configured: false, reason: 'status check timed out' });
        expect(list.find(p => p.id === 'google-browser')?.configured).toBe(true);
        expect(delays).toContain(2000);
        const noSearch = withAcme();
        expect((await noSearch.ctx.fns.websearch.providers({})).find(p => p.id === 'acme-search')).toMatchObject({ configured: false, reason: 'handler unavailable' });
        const noStatus = withAcme({ search: () => ({ results: [] }) }, { handlers: { search: 'acme.search', status: 'acme.status' } });
        expect((await noStatus.ctx.fns.websearch.providers({})).find(p => p.id === 'acme-search')).toMatchObject({ configured: false, reason: 'handler unavailable' });
    });
});

describe('websearch.search core', () => {
    const ok = () => ({ results: [{ title: 'A', url: 'https://a.test/' }] });
    test('default from settings, per-call override and fresh-install default', async () => {
        const found = await sdkCtx({ settings: { defaultEngine: 'acme-search' } }).fns.websearch.search({ query: 'q' }).catch(e => String(e));
        expect(found).toContain('unknown engine acme-search');
        const { ctx, calls } = withAcme({ search: ok });
        expect((await ctx.fns.websearch.search({ query: 'q', engine: 'acme-search' })).engine).toBe('acme-search');
        expect(calls).toEqual(['search']);
        expect((await ctx.fns.websearch.search({ query: 'q' })).engine).toBe('google-browser');
    });
    test('unknown engine names the id and lists registered ids', async () => {
        await expect(sdkCtx().fns.websearch.search({ query: 'q', engine: 'nope' }))
            .rejects.toThrow('websearch.search: unknown engine nope (available: brave, google-browser, openserp)');
    });
    test('removed default fails without calling another provider', async () => {
        const ctx = sdkCtx({ settings: { defaultEngine: 'gone-search' } });
        let google = 0; ctx.registry.browser.googleSearch = () => { google++; return { results: [] }; };
        await expect(ctx.fns.websearch.search({ query: 'q' })).rejects.toThrow(/unknown engine gone-search \(available: .*google-browser/);
        expect(google).toBe(0);
    });
    test('unconfigured brave names the setting and calls nothing else', async () => {
        const ctx = sdkCtx({ settings: { defaultEngine: 'brave' } });
        const original = globalThis.fetch; let fetched = 0; globalThis.fetch = (() => { fetched++; throw new Error('no'); }) as unknown as typeof fetch;
        let google = 0; ctx.registry.browser.googleSearch = () => { google++; return { results: [] }; };
        try {
            await expect(ctx.fns.websearch.search({ query: 'q' }))
                .rejects.toThrow('websearch.search: engine brave is not configured (API key not set; set websearch.braveApiKey)');
        } finally { globalThis.fetch = original; }
        expect(fetched).toBe(0); expect(google).toBe(0);
    });
    test('slow status fails with status check timed out and never calls search', async () => {
        fastStatusBound();
        const { ctx, calls } = withAcme({ search: ok, status: () => new Promise(() => {}) });
        await expect(ctx.fns.websearch.search({ query: 'q', engine: 'acme-search' })).rejects.toThrow('status check timed out');
        expect(calls).toEqual(['status']);
    });
    test('missing search handler fails with handler unavailable', async () => {
        const { ctx } = withAcme();
        await expect(ctx.fns.websearch.search({ query: 'q', engine: 'acme-search' })).rejects.toThrow('websearch.search: acme-search: handler unavailable');
    });
    test('ordinary errors become request failed; provider errors pass through', async () => {
        const plain = withAcme({ search: () => { throw new Error('fetch https://api.acme.test/?key=SECRET failed'); } });
        const message = await plain.ctx.fns.websearch.search({ query: 'q', engine: 'acme-search' }).catch(e => String(e.message));
        expect(message).toBe('websearch.search: acme-search: request failed');
        const safe = withAcme({ search: () => { throw safe.ctx.fns.websearch.providerError({ message: 'rate limited' }); } });
        await expect(safe.ctx.fns.websearch.search({ query: 'q', engine: 'acme-search' })).rejects.toThrow(/^websearch\.search: acme-search: rate limited$/);
        const long = withAcme({ search: () => { throw long.ctx.fns.websearch.providerError({ message: 'x'.repeat(500) }); } });
        const longMessage = await long.ctx.fns.websearch.search({ query: 'q', engine: 'acme-search' }).catch(e => String(e.message));
        expect(longMessage.length).toBe('websearch.search: acme-search: '.length + 200);
    });
    test('normalization drops bad, credential and duplicate URLs, strips markup, fills fields, clamps limit', async () => {
        const { ctx } = withAcme({ search: (o) => {
            expect(o).toEqual({ query: 'x y', limit: 20 });
            return { sourceEngine: 'acme-backend', results: [
                { title: 'JS', url: 'javascript:alert(1)' }, { title: 'Cred', url: 'https://u:p@a.test/' }, { title: '<b>A</b>', url: 'https://a.test/#top', description: '<i>d</i> &amp; e' },
                { title: 'dup', url: 'https://a.test/' }, null, { url: 'https://no-title.test/' },
                ...Array.from({ length: 30 }, (_, i) => ({ title: `R${i}`, url: `https://r.test/${i}`, extraSnippets: ['s', 1, ''] })),
            ] };
        } });
        const found = await ctx.fns.websearch.search({ query: '  x y ', limit: 50, engine: 'acme-search' });
        expect(found.results).toHaveLength(20);
        expect(found.results[0]).toEqual({ title: 'A', url: 'https://a.test/', description: 'd & e', descriptionHtml: null, publishedAt: null, language: null, site: null, extraSnippets: [] });
        expect(found.results[1].extraSnippets).toEqual(['s']);
        expect(found.sourceEngine).toBe('acme-backend');
        expect(Object.keys(found).sort()).toEqual(['durationMs', 'engine', 'query', 'results', 'sourceEngine']);
    });
    test('google-browser results are normalized: fragment duplicates merged, non-HTTP(S) dropped', async () => {
        const ctx = sdkCtx({ googleResults: [
            { title: 'One', url: 'https://g.test/page#a', snippet: 's' }, { title: 'One again', url: 'https://g.test/page#b' },
            { title: 'FTP', url: 'ftp://g.test/file' },
        ] });
        const found = await ctx.fns.websearch.search({ query: 'q', engine: 'google-browser' });
        expect(found.results.map(r => r.url)).toEqual(['https://g.test/page']);
        expect(found.sourceEngine).toBeUndefined();
    });
    test('invalid handler output fails with invalid response shape', async () => {
        const { ctx } = withAcme({ search: () => ({ items: [] }) });
        await expect(ctx.fns.websearch.search({ query: 'q', engine: 'acme-search' })).rejects.toThrow('websearch.search: acme-search: invalid response shape');
    });
});
