import { expect, spyOn, test } from 'bun:test';
import { mkTestCtx } from '../../_testCtx.entry';
import { runClaimed } from '../../agent/modelsTestCtx.entry';
import evalToolCode from '../../repl/eval';
import codex from '../$modelProvider_codex';
import fixture from '../fixtures/codex-controls/0.170.0.json';
import ordinaryStatus from '../../../plugins/websearch/src/websearch/providerStatus';

// Keep the SDK, agent.run, guarded tools.eval, search facade, and persisted account/default real.
// Only the model/search peers are fixtures. No remote request can escape the fetch spy.
test('search follows the individual issuing inference through guarded eval, not its parent or a replacement', async () => {
    const ctx = await mkTestCtx({ env: { MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'), CODEX_CLI_VERSION: fixture.codexCli, EVAL_TYPECHECK: 'false' } });
    const model = fixture.bundledModelExcerpt;
    const registry = ctx.state.registry;
    registry.repl.eval = evalToolCode;
    registry.models.catalog.priceCatalog = async () => ({});
    const searches: string[] = [], inferences: string[] = [], unexpected: string[] = [];
    let pending: { name: string; code: string } | undefined;
    let afterHandoff: (() => void) | undefined;
    let beforeSearchSend: (() => Promise<void>) | undefined, afterSearchSend: (() => Promise<void>) | undefined;
    const accountIds = new Map<string,string>();
    const jwt = (account: string, version: string) => `e30.${Buffer.from(JSON.stringify({exp: Math.floor(Date.now()/1000)+3600, 'https://api.openai.com/auth': {chatgpt_account_id: account}})).toString('base64url')}.${version}`;
    const transport = registry.models.transport.fetch;
    registry.models.transport.fetch = async (c:Context, s:Session|null, o: {url:string}) => {
        if (o.url.endsWith('/alpha/search')) { const hook = beforeSearchSend; beforeSearchSend = undefined; await hook?.(); }
        return transport(c,s,o);
    };
    const searchTokens: string[] = [];
    const sample = [{ url: 'javascript:invalid', title: 'invalid' }, { url: 'https://source.test/#first', title: '<b>Source</b>', snippet: 'one' }, { url: 'https://source.test/#duplicate', title: 'Duplicate' }];
    const backend = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = String(input), account = new Headers(init?.headers).get('chatgpt-account-id') ?? '';
        if (url === 'https://chatgpt.com/backend-api/codex/models' || url.startsWith('https://chatgpt.com/backend-api/codex/models?')) return Response.json({ models: [model] });
        if (url === 'https://chatgpt.com/backend-api/codex/alpha/search') {
            searches.push(account); searchTokens.push(new Headers(init?.headers).get('authorization') ?? '');
            if (afterSearchSend) {const hook = afterSearchSend; afterSearchSend = undefined; await hook(); return new Response(null,{status:401});}
            return Response.json({ results: sample });
        }
        if (url === 'https://chatgpt.com/backend-api/codex/responses') {
            const body = JSON.parse(String(init?.body));
            expect(body.tools.every((t: { type: string }) => t.type === 'function')).toBe(true);
            inferences.push(account);
            const call = pending; pending = undefined;
            const hook = afterHandoff; afterHandoff = undefined; hook?.();
            const event = call ? { type: 'response.output_item.done', item: { type: 'function_call', call_id: crypto.randomUUID(), name: call.name, arguments: JSON.stringify({ code: call.code }) } } : { type: 'response.output_text.delta', delta: 'done' };
            return new Response(`data: ${JSON.stringify(event)}\n\ndata: {"type":"response.completed","response":{"id":"fixture","status":"completed"}}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
        }
        unexpected.push(new URL(url).pathname); throw Error('Unmocked network request');
    };
    const spy = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(backend, { preconnect() { throw Error('Unexpected preconnect'); } }));
    try {
        const entry = ({nativeWebSearch, ...definition}: types.models.ProviderDefinition) => ({ definition, ...(nativeWebSearch ? { native: {...nativeWebSearch} } : {}), owner: 'core', module: 'models', rel: `models/$modelProvider_${definition.id}.ts` });
        const plain: types.models.ProviderDefinition = { id: 'fixture', label: 'Ordinary', fields: [], transports: ['direct'], test: async () => ({ status: 'available', reason: 'fixture', message: 'Fixture', checkedAt: Date.now() }), listModels: async () => [{ id: model.slug }], stream: async () => {
            inferences.push('plain'); const call = pending; pending = undefined;
            return { text: call ? '' : 'done', thinking: '', finishReason: call ? 'tool_calls' : 'stop', toolCalls: call ? [{ id: crypto.randomUUID(), name: call.name, args: { code: call.code } }] : [], usage: {} };
        } };
        const models = ctx.state.models.providers = { codex: entry(codex), fixture: entry(plain) };
        const create = async (provider: string, accountName: string) => ctx.fns.models.create({ provider, accountName, config: {}, secrets: {} });
        for (const account of ['A', 'B']) {
            const { id } = await create('codex', account); accountIds.set(account,id);
            const { conn } = await ctx.fns.models.connections.resolve({ id });
            const intent = crypto.randomUUID();
            const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, 'https://api.openai.com/auth': { chatgpt_account_id: account } })).toString('base64url');
            await ctx.fns.procs.db.run({ sql: 'UPDATE llm_connections SET codex_login_intent=? WHERE id=?', params: [intent, id] });
            await ctx.fns.models.provider.codex.codexAuth({ conn, op: 'store', intent, tokens: { access_token: `e30.${payload}.fixture`, refresh_token: 'fixture' } });
            expect((await ctx.fns.models.listModels({ id, refresh: true })).error).toBeUndefined();
        }
        await create('fixture', 'plain');
        ctx.state.websearch ??= {}; ctx.state.websearch.providers ??= {};
        ctx.state.procs.modules = [...ctx.state.procs.modules.filter((m: { name: string }) => m.name !== 'websearch'), { name: 'websearch', plugin: true, namespaces: ['websearch'], routes: [], fns: ['websearch.fixtureSearch'] }];
        registry.websearch ??= {};
        // The isolated core fixture does not load ordinary plugin helpers.
        registry.websearch.providerStatus = ordinaryStatus;
        registry.websearch.fixtureSearch = async () => { searches.push('openserp'); return { results: sample }; };
        ctx.state.websearch.providers.openserp = { id: 'openserp', owner: 'websearch', label: 'OpenSERP', settings: [], handlers: { search: 'websearch.fixtureSearch' } };
        // Same settings row/key as installations predating native search, not a newly selected default.
        await ctx.fns.procs.db.run({ sql: "INSERT INTO settings(module,scope_type,scope_id,key,value,is_secret,updated_at) VALUES ('websearch','global','','defaultEngine',?,0,?)", params: [JSON.stringify('openserp'), Date.now()] });
        const parent = await ctx.fns.agent.start({ model: `codex/A:${model.slug}`, presetId: 'creator' });
        await ctx.fns.agentPreset.create({ preset: { id: 'search-only', name: 'Search only', allow: ['tools.eval'], plugins: ['websearch'] } });
        const fork = (route: string) => ctx.fns.session.fork({ id: parent.id, presetId: 'search-only', model: `${route}:${model.slug}` });
        const b = await fork('codex/B'), ordinary = await fork('fixture/plain');
        const turn = async (agent: types.agent.Agent, account: string, engine: string | null, explicit = false, expectedSearches?: string[], nextAccount = account) => {
            const evalName = ctx.fns.tools.list({}).find((t: { name: string }) => t.name === 'eval')?.wireName ?? 'eval';
            const code = `try { agent.scratchpad.searchResult = await ctx.fns.websearch.search({ query: 'public fixture', limit: 2${explicit ? ", engine: 'openserp'" : ''} }); } catch (e) { agent.scratchpad.searchResult = { refused: String(e) }; }`;
            pending = { name: evalName, code };
            const n = inferences.length, k = searches.length;
            delete agent.scratchpad.searchResult;
            await runClaimed(ctx, agent, 'Run the search fixture.');
            expect(inferences.slice(n)).toEqual([account, nextAccount]); // call and continuation, no hidden inference
            if (!engine) expect(agent.scratchpad.searchResult).toMatchObject({ refused: expect.any(String) });
            else expect(agent.scratchpad.searchResult).toMatchObject({ engine, results: [{ title: 'Source', url: 'https://source.test/' }] });
            expect(searches.slice(k)).toEqual(expectedSearches ?? (engine ? [engine === 'native:codex' ? account : engine] : []));
        };
        await turn(parent, 'A', 'openserp', true); await turn(ordinary, 'plain', 'openserp');
        await turn(parent, 'A', 'native:codex'); await turn(b, 'B', 'native:codex');
        const id = accountIds.get('A')!;
        const {conn} = await ctx.fns.models.connections.resolve({id});
        const login = async (account:string) => {
            const intent = crypto.randomUUID();
            await ctx.fns.procs.db.run({sql:'UPDATE llm_connections SET codex_login_intent=? WHERE id=?',params:[intent,id]});
            await ctx.fns.models.provider.codex.codexAuth({conn,op:'store',intent,tokens:{access_token:jwt(account,'relogin'),refresh_token:'fixture'}});
        };
        beforeSearchSend = () => login('B'); await turn(parent,'A',null,false,[],'B'); await login('A');
        beforeSearchSend = async () => { await ctx.fns.models.provider.codex.codexAuth({conn,op:'clear'}); await login('A'); };
        await turn(parent,'A',null);
        // Trigger a verified renewal between inference and the search credential read. Keep the generation, change the tuple.
        const renewedToken = jwt('A','renewed');
        const renew = async () => {
            const key = `${id}.codex-auth`, value = JSON.parse(await ctx.fns.secrets.getLocal({namespace:'models',name:key}));
            await ctx.fns.secrets.putLocal({namespace:'models',name:key,value:JSON.stringify({...value,expiresAt:Date.now()-1000})});
            await ctx.fns.models.provider.codex.codexAuth({conn:{...conn,fetch:async()=>Response.json({access_token:renewedToken,refresh_token:'fixture'})},op:'token'});
        };
        // tools.call starts after inference's admission lock has been released.
        const call = registry.tools.call;
        registry.tools.call = async (c:Context,s:Session|null,o:unknown) => { registry.tools.call = call; await renew(); return call(c,s,o); };
        await turn(parent,'A','native:codex'); expect(searchTokens.at(-1)).toBe('Bearer '+renewedToken);
        // A late rejection may not invalidate the replacement. Do not run DB mutations in mock fetch's admission transaction.
        let release!: () => void; const released = new Promise<void>(r=>{release=r});
        const readWire = registry.models.transport.fetch;
        const gate = ctx.state.models.nativeSearchHandoff!;
        registry.models.transport.fetch = async (c:Context,s:Session|null,o:{init?:RequestInit;url:string}) => {
            if (o.url.endsWith('/alpha/search') && o.init) { const admit = gate.get(o.init)!; gate.set(o.init, async (send:(body:string)=>void) => { await admit(send); release(); }); }
            return readWire(c,s,o);
        };
        // Register the continuation outside the search transaction; the HTTP mock only waits for its result.
        const relogged = released.then(()=>login('A'));
        afterSearchSend = () => relogged;
        await turn(parent,'A',null,false,['A']);
        registry.models.transport.fetch = readWire;
        expect((await ctx.fns.models.provider.codex.codexAuth({conn,op:'status'})).loggedIn).toBe(true);
        // Replace the registration after the issuing HTTP handoff, before its tool is dispatched.
        afterHandoff = () => { models.codex = entry({ ...codex }); };
        await turn(parent, 'A', null);
        afterHandoff = () => { const { nativeWebSearch: _removed, ...rest } = codex; models.codex = entry(rest); };
        await turn(parent, 'A', null); await turn(parent, 'A', 'openserp');
        expect(unexpected).toEqual([]);
    } finally { spy.mockRestore(); }
}, 60_000);
