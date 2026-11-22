// Test-only context wiring the real websearch core, built-in handlers and declarations without a database,
// browser or boot. `.entry.ts` is skipped by the scanner, so this file never registers as a runtime function.
import braveSearch from './braveSearch';
import braveStatus from './braveStatus';
import googleBrowserSearch from './googleBrowserSearch';
import openserpEndpoint from './openserpEndpoint';
import openserpSearch from './openserpSearch';
import openserpStatus from './openserpStatus';
import providerError from './providerError';
import providerIds from './providerIds';
import providerStatus from './providerStatus';
import providers from './providers';
import search from './search';
import brave from './$websearchProvider_brave';
import google from './$websearchProvider_google-browser';
import openserp from './$websearchProvider_openserp';

type Raw = (ctx: any, session: any, opts: any) => unknown;
export type SdkCtx = Context & { registry: Record<string, Record<string, Raw>> };

export function sdkCtx(opts: {
    settings?: Record<string, string>;
    braveKey?: string | null;
    googleResults?: Array<{ title: string; url: string; snippet?: string }>;
} = {}): SdkCtx {
    const settings = { defaultEngine: 'google-browser', openserpEndpoint: 'http://127.0.0.1:7000', ...opts.settings };
    const registry: Record<string, Record<string, Raw>> = {
        settings: { getString: (_c, _s, o: { key: string; fallback?: string }) => settings[o.key as keyof typeof settings] ?? o.fallback },
        secrets: { resolveSetting: async (_c, _s, o: { key: string }) => o.key === 'braveApiKey' ? opts.braveKey ?? null : null },
        browser: { googleSearch: () => ({ results: opts.googleResults ?? [{ title: 'Google', url: 'https://google.test/', snippet: 'snippet' }] }) },
        websearch: {
            braveSearch, braveStatus, googleBrowserSearch, openserpEndpoint, openserpSearch, openserpStatus,
            providerError, providerIds, providerStatus, providers, search,
        } as unknown as Record<string, Raw>,
    };
    const ctx: any = { registry, state: { websearch: { providers: {} } } };
    const wrap = (node: any): any => new Proxy(node, {
        get(target, prop) {
            const v = target[prop];
            if (typeof v === 'function') return (o?: unknown) => v(ctx, null, o);
            return v && typeof v === 'object' ? wrap(v) : v;
        },
    });
    ctx.fns = wrap(registry);
    for (const [id, def] of Object.entries({ 'google-browser': google, openserp, brave })) {
        ctx.state.websearch.providers[id] = {
            id, owner: 'websearch', rel: `websearch/$websearchProvider_${id}.ts`, abs: `/fixture/websearch/$websearchProvider_${id}.ts`,
            label: def.label, description: def.description, handlers: { ...def.handlers }, settings: [...(def.settings ?? [])],
        };
    }
    return ctx as SdkCtx;
}
