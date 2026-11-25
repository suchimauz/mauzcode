import { beforeAll, expect, test } from 'bun:test';
import { mkTestCtx } from '../../_testCtx.entry';

let ctx: Context;
beforeAll(async () => { ctx = await mkTestCtx({ db: false }); }, 60000);
const request = { messages: [{role:'user', content:'fixture marzipan'}] };
const secrets = ['opaque-private-value'];
const auth = { generation: null, credentialRevision: 1 };
const conn = {} as types.models.ResolvedConnection;

for (const provider of ['codex', 'claude'] as const) {
    for (const stage of ['http', 'stream'] as const) test(`${provider} ${stage}: preserves wording and rejection/acceptance but suppresses echoes`, async () => {
        for (const message of ['Unsupported parameter', 'Invalid marzipan', secrets[0]!]) {
            const body = {error:{message}};
            const action = async () => {
                if (provider === 'claude') await ctx.fns.models.provider.claude.claudeWireFailure({conn, body:JSON.stringify(body), h:new Headers(), ...(stage === 'http' && {status:400}), request, secrets});
                else if (stage === 'http') await ctx.fns.models.provider.codex.codexWireChecked({conn, auth, res:Response.json(body,{status:400}), request, secrets});
                else throw ctx.fns.models.provider.codex.codexWireStreamFailed({ev:{response:body}, request,secrets});
            };
            const error = await action().then(() => null, e => e);
            const d = error.failure.diagnostic;
            expect(d).toMatchObject({provider, stage});
            expect(d.status).toBe(stage === 'http' ? 400 : undefined);
            expect(error.failure.acceptance).toBe(stage === 'http' ? 'rejected' : 'accepted');
            expect(error.message).toBe(d.summary);
            expect(d.message).toBe(message === 'Unsupported parameter' ? message : undefined);
            expect(JSON.stringify(error)).not.toContain('marzipan');
            expect(JSON.stringify(error)).not.toContain(secrets[0]!);
        }
    });
}
for (const protocol of ['openai-chat','openai-responses','anthropic','gemini']) {
    test(`custom ${protocol} uses the registered provider ID, not the protocol`, async () => {
        const conn = {id:'fixture', provider:'custom', config:{baseUrl:'https://custom.test/v1', protocol, sessionAffinity:false}, secret:async () => secrets[0], fetch:async () => Response.json({error:{message:'Unsupported parameter'}},{status:400})} as unknown as types.models.ResolvedConnection;
        const err = await ctx.fns.models.provider.custom.customStream({conn, req:{model:'fixture',sessionId:'fixture-session',instructions:'',messages:[]}}).then(() => null, e => e);
        expect(err).toMatchObject({failure:{diagnostic:{provider:'custom',stage:'http',message:'Unsupported parameter'}}});
    });
}
test('no-response, unfinished Codex stream and cancellation are distinct', () => {
    const interrupted = ctx.fns.models.provider.codex.codexWireInterrupted;
    for (const noResponse of [false,true]) {
        const error = interrupted({error:Object.assign(new Error('fixture-private'), {code:'ECONNRESET'}), noResponse});
        expect(error).toMatchObject({failure:{code:'TRANSPORT', replaySafe:false, retryable:true, diagnostic:{stage:noResponse?'transport':'stream'}}});
        expect(String(error)).not.toContain('fixture-private');
    }
    expect(interrupted({error:new Error(), signal:AbortSignal.abort()})).toMatchObject({failure:{code:'CANCELLED'}});
});
