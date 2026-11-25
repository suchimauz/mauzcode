import { expect, test } from 'bun:test';
import { mkTestCtx } from '../../../../src/_testCtx.entry';
import route from './route';
import headers from './headers';
import provider from './$modelProvider_opencode-go';

for (const protocol of ['openai-chat', 'openai-responses', 'anthropic', 'gemini'] as const) {
    test(`OpenCode Go ${protocol} preserves provider identity on upstream rejection`, async () => {
        const ctx = await mkTestCtx();
        const plugin = { fns: { opencodeGo: { headers: (o: Parameters<typeof headers>[2]) => headers(ctx, null, o) } } } as unknown as Context;
        const definition: types.models.ProviderDefinition = { ...provider, route: (_ctx, conn, req) => route(plugin, null, {conn, ...req}) };
        (ctx.state.models ??= {}).providers = { 'opencode-go': { owner:'fixture', module:'opencodeGo', rel:'fixture', definition } };
        const view = await ctx.fns.models.create({provider:provider.id, accountName:'fixture', config:{}, secrets:{apiKey:'oc_sk_fixture'}, transport:{kind:'direct'}});
        await ctx.fns.procs.db.run({sql:'UPDATE llm_connections SET models_cache=?::jsonb WHERE id=?', params:[JSON.stringify([{id:'model', protocol}]),view.id]});
        let url = '';
        ctx.state.registry.models.transport.fetch = async (_ctx: unknown, _session: unknown, o: {url:string}) => {
            url = o.url;
            return Response.json({error:{message:'Unsupported parameter'}}, {status:400});
        };
        const error = await ctx.fns.models.stream({connectionId:view.id, model:'model', sessionId:'session-fixture', messages:[], instructions:''}).then(() => null, (e: any) => e);
        expect(url).toContain({'openai-chat':'/chat/completions','openai-responses':'/responses','anthropic':'/messages','gemini':':streamGenerateContent'}[protocol]);
        expect(error).toMatchObject({failure:{diagnostic:{provider:'opencode-go',stage:'http',status:400,message:'Unsupported parameter'}}});
        expect(error.message).toBe(error.failure.diagnostic.summary);
        expect(error.message).not.toContain('oc_sk_fixture');
    });
}
