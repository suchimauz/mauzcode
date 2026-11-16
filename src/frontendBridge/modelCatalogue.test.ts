import { expect, test } from 'bun:test';
import catalogue from './modelCatalogue';
import effort from './modelEffort';

const connection = (over: any) => ({ id: 'c1', provider: 'claude', providerRegistered: true, accountName: 'work', enabled: true, disabledModels: [], ...over });
const fixture = (lists: Record<string, any>, disabled: string[] = []) => ({ fns: { models: {
    // Stub naming: catalogue labels win, everything else gets a visible resolver marker.
    displayNames: async ({ routes, labels }: any) => Object.fromEntries(routes.map((r: string) => [r, labels?.[r] ?? 'Named ' + r.slice(r.indexOf(':') + 1)])),
    providers: () => [{ id: 'claude' }, { id: 'codex' }, { id: 'custom' }],
    disabledProviders: async () => new Set(disabled),
    list: async () => [
        connection({}),
        connection({ id: 'c2', provider: 'codex', accountName: 'me', disabledModels: ['gpt-off'] }),
        connection({ id: 'c3', provider: 'custom', accountName: 'local', enabled: false }),
        connection({ id: 'c4', provider: 'gone', providerRegistered: false, accountName: 'old' }),
        connection({ id: 'c5', provider: 'codex', accountName: 'broken' }),
    ],
    listModels: async ({ id }: any) => { const v = lists[id]; if (v instanceof Error) throw v; return v; },
} } }) as any;

test('groups models by connection account with labels, routes, reasoning and disabled flags', async () => {
    const ctx = fixture({
        c1: { models: [{ id: 'claude-opus-5', label: 'Opus 5', reasoning: { supported: ['low', 'high'], default: 'high' } }], source: 'provider', cachedAt: 1 },
        c2: { models: [{ id: 'gpt-5:mini' }, { id: 'gpt-off' }, { id: 'gpt-x', disabled: true }], source: 'provider', cachedAt: 1 },
        c3: { models: [{ id: 'llama' }], source: 'manual', cachedAt: null },
        c5: new Error('network down'),
    });
    const result = await catalogue(ctx, null, {});
    expect(result.groups).toEqual([
        { connectionId: 'c1', provider: 'claude', accountName: 'work', enabled: true, unavailable: false },
        { connectionId: 'c2', provider: 'codex', accountName: 'me', enabled: true, unavailable: false },
        { connectionId: 'c3', provider: 'custom', accountName: 'local', enabled: false, unavailable: false },
        { connectionId: 'c4', provider: 'gone', accountName: 'old', enabled: true, unavailable: true, error: 'Provider gone is not registered' },
        { connectionId: 'c5', provider: 'codex', accountName: 'broken', enabled: true, unavailable: true, error: 'Model list could not be loaded' },
    ]);
    expect(result.models.map(m => [m.model, m.label, m.groupLabel, m.disabled])).toEqual([
        ['claude/work:claude-opus-5', 'Opus 5', 'work', false],
        ['codex/me:gpt-5:mini', 'Named gpt-5:mini', 'me', false],
        ['codex/me:gpt-off', 'Named gpt-off', 'me', true],
        ['codex/me:gpt-x', 'Named gpt-x', 'me', true],
        ['custom/local:llama', 'Named llama', 'local', true],
    ]);
    expect(result.models[0]!.reasoning).toEqual({ supported: ['low', 'high'], default: 'high' });
});

test('an empty catalogue with a provider error is unavailable; an empty manual list is not', async () => {
    const ctx = fixture({ c1: { models: [], source: 'provider', cachedAt: null, error: 'login required' }, c2: { models: [], source: 'manual', cachedAt: null }, c3: { models: [], source: 'manual', cachedAt: null }, c5: { models: [], source: 'manual', cachedAt: null } });
    const result = await catalogue(ctx, null, {});
    expect(result.groups.map(g => [g.accountName, g.unavailable])).toEqual([['work', true], ['me', false], ['local', false], ['old', true], ['broken', false]]);
    expect(result.models).toEqual([]);
});

test('effort projection uses catalogue levels: auto default, downgrade, raise, and none without metadata', () => {
    const reasoning = { supported: ['low', 'high'] as any, default: 'high' as any };
    expect(effort({} as any, null, { reasoning, requested: 'auto' })).toEqual({ requested: 'auto', applied: 'high', supported: ['auto', 'low', 'high'], defaultEffort: 'high', mode: 'catalogue', downgraded: false });
    expect(effort({} as any, null, { reasoning, requested: 'xhigh' })).toMatchObject({ applied: 'high', downgraded: true });
    expect(effort({} as any, null, { reasoning, requested: 'off' })).toMatchObject({ applied: 'low', downgraded: true });
    expect(effort({} as any, null, { reasoning, requested: 'bogus' })).toMatchObject({ requested: 'auto', applied: 'high' });
    expect(effort({} as any, null, { reasoning: null, requested: 'high' })).toEqual({ requested: 'high', applied: 'high', supported: [], defaultEffort: 'auto', mode: 'none', downgraded: false });
});

test('missing provider is unavailable without a catalogue call while healthy connections stay listed', async () => {
    const calls: string[] = [];
    const ctx = fixture({ c1: { models: [{ id: 'opus' }], source: 'provider', cachedAt: 1 }, c2: { models: [], source: 'manual', cachedAt: null }, c3: { models: [], source: 'manual', cachedAt: null }, c5: { models: [], source: 'manual', cachedAt: null } });
    const list = ctx.fns.models.listModels; ctx.fns.models.listModels = async (o: any) => { calls.push(o.id); return list(o); };
    const result = await catalogue(ctx, null, {});
    expect(calls).not.toContain('c4');
    expect(result.groups.find(g => g.connectionId === 'c4')).toMatchObject({ unavailable: true });
    expect(result.models.map(m => m.model)).toEqual(['claude/work:opus']);
});

test('provider error with cached models is degraded: cached models stay usable and the error is kept', async () => {
    const ctx = fixture({ c1: { models: [{ id: 'opus' }], source: 'provider', cachedAt: 5, error: 'HTTP 503' }, c2: { models: [], source: 'manual', cachedAt: null }, c3: { models: [], source: 'manual', cachedAt: null }, c5: { models: [], source: 'manual', cachedAt: null } });
    const result = await catalogue(ctx, null, {});
    expect(result.groups[0]).toEqual({ connectionId: 'c1', provider: 'claude', accountName: 'work', enabled: true, unavailable: false, error: 'HTTP 503' });
    expect(result.models[0]).toMatchObject({ model: 'claude/work:opus', disabled: false });
});

test('effort projection matches SDK reasoning resolution after a model switch keeps an unsupported preference', async () => {
    const sdk = (await import('../models/inference/resolveReasoning')).default;
    const ctx: any = { fns: { models: { inference: { failure: ({ message }: any) => new Error(message) } } } };
    const catalogues = [{ supported: ['low', 'medium'], default: 'medium' }, { supported: ['minimal', 'high'], default: 'high' }, { supported: ['xhigh'], default: 'xhigh' }] as any[];
    for (const reasoning of catalogues) for (const requested of ['auto', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh']) {
        const ui = effort({} as any, null, { reasoning, requested });
        const real = sdk(ctx, null, { model: 'm', preference: requested, metadata: reasoning });
        expect([ui.requested, ui.applied, ui.downgraded]).toEqual([real.requested, real.applied, real.fallbackReason !== null]);
    }
});

test('unexpected catalogue throws never leak their raw message into the projection', async () => {
    const ctx = fixture({ c1: new Error('postgres://admin:sk-SECRET-123@db/x failed'), c2: { models: [{ id: 'gpt' }], source: 'provider', cachedAt: 1 }, c3: { models: [], source: 'manual', cachedAt: null }, c5: { models: [], source: 'manual', cachedAt: null } });
    const result = await catalogue(ctx, null, {});
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(JSON.stringify(result)).not.toContain('postgres://');
    expect(result.groups[0]).toMatchObject({ unavailable: true, error: 'Model list could not be loaded' });
    expect(result.models.map(m => m.model)).toEqual(['codex/me:gpt']);
});

test('display names come from models.displayNames with catalogue labels; a resolver failure keeps ids', async () => {
    const lists = { c1: { models: [{ id: 'claude-opus-5', label: 'Opus 5' }, { id: 'claude-opus-4-5' }], source: 'provider', cachedAt: 1 } };
    const ctx = fixture(lists);
    let seen: any;
    ctx.fns.models.displayNames = async (o: any) => { seen = o; return { 'claude/work:claude-opus-5': 'Opus 5', 'claude/work:claude-opus-4-5': 'Claude Opus 4.5' }; };
    const named = await catalogue(ctx, null, {});
    expect(seen.labels).toEqual({ 'claude/work:claude-opus-5': 'Opus 5' });
    expect(named.models.filter(m => m.provider === 'claude').map(m => m.label)).toEqual(['Opus 5', 'Claude Opus 4.5']);
    ctx.fns.models.displayNames = async () => { throw new Error('offline'); };
    const raw = await catalogue(ctx, null, {});
    expect(raw.models.filter(m => m.provider === 'claude').map(m => m.label)).toEqual(['Opus 5', 'claude-opus-4-5']);
});

test('a globally disabled provider: models flagged disabled, groups not enabled and not unavailable, cache-only reads', async () => {
    const ctx = fixture({
        c1: { models: [{ id: 'claude-opus-5' }], source: 'provider', cachedAt: 1 },
        c2: { models: [{ id: 'gpt-5:mini' }], source: 'provider', cachedAt: 1 },
        c3: { models: [{ id: 'llama' }], source: 'manual', cachedAt: null },
        c5: new Error('network down'),
    }, ['codex']);
    const calls: any[] = [];
    const listModels = ctx.fns.models.listModels;
    ctx.fns.models.listModels = async (o: any) => { calls.push(o); return listModels(o); };
    const result = await catalogue(ctx, null, {});
    // codex groups (c2, c5) are disabled, never unavailable notices; the throwing catalogue is not even asked.
    expect(result.groups.map(g => [g.connectionId, g.enabled, g.unavailable, g.error ?? null])).toEqual([
        ['c1', true, false, null],
        ['c2', false, false, null],
        ['c3', false, false, null],
        ['c4', true, true, 'Provider gone is not registered'],
        ['c5', false, false, null],
    ]);
    expect(result.models.filter(m => m.provider === 'codex').every(m => m.disabled)).toBe(true);
    expect(result.models.find(m => m.provider === 'claude')!.disabled).toBe(false);
    // Every catalogue call for a disabled provider is cacheOnly; none may hit the provider list.
    expect(calls.filter(o => o.id === 'c2' || o.id === 'c5').every(o => o.cacheOnly === true)).toBe(true);
    expect(calls.some(o => o.id === 'c5' && !o.cacheOnly)).toBe(false);
    expect(calls.find(o => o.id === 'c1')!.cacheOnly).toBeUndefined();
});
