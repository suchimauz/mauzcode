import { expect, spyOn, test } from 'bun:test';
import { mkTestCtx } from '../../_testCtx.entry';
import loader from '../$loader_modelProvider';
import codex from '../$modelProvider_codex';

// The issuing stream, registry, facade, connection locks, encrypted store and transport are real.
// The test supplies only the private run-loop/tool tickets and the mock HTTP peer.
test('a third-party key stays bound through replacement, proxy preparation, cancellation and reload', async () => {
    const ctx = await mkTestCtx({env:{ MAUZCODE_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString('base64') }});
    const state: types.models.State = ctx.state.models;
    const registry = ctx.state.registry;
    let handler = 0, sent = 0, ordinary = 0, inference = 0, reads = 0;
    let retained: types.models.NativeWebSearchConnection | undefined;
    let mutate: (() => Promise<void>) | undefined, proxyBarrier: (() => Promise<void>) | undefined;
    const getSecret = registry.secrets.getLocal;
    registry.secrets.getLocal = (...args: unknown[]) => { reads++; return getSecret(...args); };
    const mock = spyOn(globalThis, 'fetch').mockImplementation((async (url, init) => {
        if (String(url) !== 'https://acme.invalid/search') { expect(String(url)).toBe('https://acme.invalid/infer'); inference++; }
        else { sent++; expect(new Headers(init?.headers).get('authorization')).toBe('fixture-key'); }
        return Response.json({});
    }) as typeof fetch);
    const op: types.models.NativeWebSearchOperation = {
        binding: {kind:'key',field:'apiKey'},
        async search(_ctx, conn, req) {
            handler++; retained = conn;
            const {values} = await conn.credentials();
            await mutate?.();
            const response = await conn.request('https://acme.invalid/search',{method:'POST',headers:{authorization: values.apiKey!},body:req.query});
            await response.body?.cancel();
            return {results:[{url:'https://site.test/',title:'Source'}]};
        },
    };
    const plain: types.models.ProviderDefinition = {
        id:'acme', label:'ACME fixture', fields:[{key:'apiKey',label:'Key',type:'secret',required:true}], transports:['direct','socks'],
        test: async () => ({status:'configured', reason:'fixture', message:'Fixture', checkedAt:1}),
        stream: async (_ctx, conn) => {
            await (await conn.fetch('https://acme.invalid/infer', {method:'POST',headers:{authorization:(await conn.secret('apiKey'))!},body:'fixture'})).body?.cancel();
            return {text:'',thinking:'',finishReason:'tool_calls',usage:{},toolCalls:[{id:'same-id',name:'eval',args:{}}]};
        },
    };
    const load = (operation?: types.models.NativeWebSearchOperation) => loader(ctx,null,{entries:[{
        root:'core',rootDir:ctx.state.root+'/src',abs:ctx.state.root+'/src/acme/$modelProvider_acme.ts',rel:'acme/$modelProvider_acme.ts',moduleDir:'acme',name:'acme',mod:{default:{...plain,...(operation ? {nativeWebSearch: operation} : {})}},
    }]});
    try {
        await load(op);
        const { id } = await ctx.fns.models.create({provider:'acme', accountName:'one',config:{},secrets:{apiKey:'fixture-key'}});
        const agent = await ctx.fns.agent.start({model:'acme/one:m',presetId:'creator'});
        const rotate = () => ctx.fns.models.update({id,secrets:{apiKey:'fixture-key'}}); // same bytes still count as replacement
        const modules = ctx.state.procs.modules;
        modules.push({name:'websearch',plugin:true,namespaces:['websearch'],routes:[],fns:['websearch.fixtureSearch']});
        registry.websearch.fixtureSearch = () => {ordinary++; return {results:[]};};
        registry.websearch.providerStatus = async () => ({configured:true});
        (ctx.state.websearch ??= {}).providers = {openserp:{id:'openserp',owner:'websearch',label:'Fixture',settings:[],handlers:{search:'websearch.fixtureSearch'}}};
        await ctx.fns.procs.db.run({sql:"INSERT INTO settings(module,scope_type,scope_id,key,value,is_secret,updated_at) VALUES ('websearch','global','','defaultEngine',?,0,?)",params:[JSON.stringify('openserp'),1]});
        const issue = async () => {
            const req = {connectionId:id, model:'m',instructions:'',messages:[],sessionId:agent.id,runId:crypto.randomUUID()};
            (state.nativeSearchOrigins ??= new WeakMap()).set(req,{agent,route:agent.model,runId:req.runId,current:()=>agent.model==='acme/one:m'});
            const result = await ctx.fns.models.stream(req);
            const decision = state.nativeSearchReplies!.get(result.toolCalls[0])!;
            const tool = Object.create(ctx); tool.session = ctx.fns.session.forAgent({agent}); tool.toolRun = {};
            const controller = new AbortController();
            (state.nativeSearchSteps ??= new WeakMap()).set(tool.toolRun,{decision,signal:controller.signal});
            return {tool,controller,search:()=>tool.fns.websearch.search({query:'phrase',connectionId:'forged',model:'wrong'})};
        };
        const resolved = await ctx.fns.models.connections.resolve({id});
        expect(resolved.definition.nativeWebSearch).toBeUndefined(); expect(resolved.conn.attestNativeWebSearch).toBeUndefined();
        expect(Object.keys(ctx.state.websearch.providers)).toEqual(['openserp']);
        await expect(ctx.fns.models.nativeSearch.search({query:'forged',limit:1})).rejects.toThrow('facade');
        expect((await ctx.fns.websearch.search({query:'ordinary',model:'acme/one:m',connectionId:id})).engine).toBe('openserp');
        expect(ordinary).toBe(1);
        const first = await issue(); expect((await first.search()).engine).toBe('native:acme');
        expect([handler,sent,ordinary]).toEqual([1,1,1]);
        // A callback retained from a *finished* real tools.call still sees its revoked step, not the ordinary default.
        const detached = await issue();
        const ticket = {name:'eval',args:{code:'fixture'},agent};
        (state.nativeSearchDispatch ??= new WeakMap()).set(ticket,state.nativeSearchSteps!.get(detached.tool.toolRun)!.decision);
        let later!: () => Promise<unknown>;
        const save = registry.tools.eval;
        registry.tools.eval = (tool:Context) => { later = () => tool.fns.websearch.search({query:'late'}); return 'deferred'; };
        try { expect((await ctx.fns.tools.call(ticket)).handlerExecuted).toBe(true); } finally {registry.tools.eval = save;}
        await expect(later()).rejects.toThrow(); expect([handler,sent,ordinary]).toEqual([1,1,1]);
        const previous = retained!, before = reads;
        await expect(previous.credentials()).rejects.toThrow();
        await expect(previous.request('https://acme.invalid/search',{method:'POST',body:'stale'})).rejects.toThrow();
        const registered = state.providers!.acme!.native!;
        expect(() => registered.search(ctx,resolved.conn as types.models.NativeWebSearchConnection,{model:'m',query:'bad',limit:1,signal:new AbortController().signal,deadline:Date.now()+1000})).toThrow('invocation');
        expect([handler,sent,reads]).toEqual([1,1,before]);
        const changed = await issue(); await rotate(); const atRotation = reads;
        await expect(changed.search()).rejects.toThrow(); expect(reads).toBe(atRotation); expect(sent).toBe(1);
        const during = await issue(); mutate = rotate;
        await expect(during.search()).rejects.toThrow(); mutate = undefined; expect(sent).toBe(1);
        const replaced = await issue(); await load(op); const h = handler;
        await expect(replaced.search()).rejects.toThrow(); expect(handler).toBe(h);
        await load(); const oldOrdinary = await issue(); await load(op);
        expect((await oldOrdinary.search()).engine).toBe('openserp'); expect(ordinary).toBe(2);
        const cancelled = await issue(); cancelled.controller.abort(); await expect(cancelled.search()).rejects.toThrow();
        const route = await issue(); agent.model = 'acme/one:other'; await expect(route.search()).rejects.toThrow(); agent.model = 'acme/one:m';
        const noProof = {...op,binding:{kind:'login', current:async()=>null, read:async()=>{throw Error('must not read unverified login');}}} satisfies types.models.NativeWebSearchOperation;
        await load(noProof); const missing = await issue(); await expect(missing.search()).rejects.toThrow(); expect(handler).toBe(h);
        await load(op);
        // Set up a controlled proxy: a rotation during asynchronous preparation must beat the final admission.
        await ctx.fns.procs.db.run({sql:'UPDATE llm_connections SET transport=?::jsonb WHERE id=?',params:[JSON.stringify({kind:'socks',proxyId:'fixture'}),id]});
        registry.socksProxy.readSaved = async () => { await proxyBarrier?.(); return {host:'127.0.0.1',port:1}; };
        registry.socksProxy.request = async (_ctx:Context,_s:Session|null,p:{onHandoff?:()=>void;admit?:(send:(body:string)=>void)=>Promise<void>}) => {
            if (p.admit) await p.admit(()=>{sent++;}); else { p.onHandoff?.(); inference++; } return Response.json({});
        };
        const viaProxy = await issue(); proxyBarrier = rotate; await expect(viaProxy.search()).rejects.toThrow(); proxyBarrier = undefined;
        expect([sent,ordinary]).toEqual([1,2]);
        expect(inference).toBeGreaterThan(6);
        expect((await (await issue()).search()).engine).toBe('native:acme'); expect(sent).toBe(2);
    } finally { mock.mockRestore(); }
}, 30_000);
