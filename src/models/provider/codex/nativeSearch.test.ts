import { expect, spyOn, test } from 'bun:test';
import transport from '../../transport/fetch';
import provider from '../../$modelProvider_codex';
import auth from './codexAuth';
import ssh from '../../../sshProvider/policy';
import endpoint from '../../../codexTunnel/endpoint';
import validate from '../../../codexTunnel/validate';
import isolated from '../../../codexSocksIsolated/request';

const adapter = provider.nativeWebSearch;
const target = 'https://chatgpt.com/backend-api/codex/alpha/search';
const req = () => ({ model: 'selected', query: 'public phrase', limit: 3, signal: new AbortController().signal, deadline: Date.now() + 1000 });
function fixture(reply: () => Promise<Response> | Response, request?: types.models.NativeWebSearchConnection['request']) {
    const proof = { generation: 'A', revision: '9' };
    let writes = 0, reads = 0;
    const row = { codex_generation: 'A', codex_credential_revision: 9, value_enc: '{}' };
    const value = { accountId: 'account-A', accessToken: 'fixture-A', expiresAt: Date.now() + 100000, needsLogin: false };
    const calls: Parameters<types.models.NativeWebSearchConnection['request']>[] = [];
    const state = { models: { nativeSearchConnections: new WeakSet<object>(), nativeSearchReads: new WeakMap<object,object>() } };
    const ctx = { state, fns: { models: { provider: { codex: { codexAuth: (o: Parameters<typeof auth>[2]) => auth(ctx, null, o) } } }, secrets: { decryptLocal: () => { reads++; return JSON.stringify(value); }, putLocal: () => { writes++; } }, procs: { db: { select: () => [row], transaction: (o: {fn: () => Promise<unknown>}) => o.fn(), run: () => {} }, events: { refresh: () => {} } }, session: { reconcileCodexControls: () => {} } } } as unknown as Context;
    const conn: types.models.NativeWebSearchConnection = { id: 'test', credentials: async () => { state.models.nativeSearchReads.set(proof,conn); return {values: await adapter.binding.read(ctx, conn, proof), proof}; }, request: async (url, init) => { calls.push([url, init]); return request ? request(url,init) : reply(); } };
    state.models.nativeSearchConnections.add(conn);
    return { ctx, conn, proof, row, value, calls, state, reads: () => reads, writes: () => writes };
}
// Redacted request/response based on DSH 05690e4045030bf8d4a85dbd5049d866ea6cd014, not live evidence.
test('one standalone live POST, selected model and account, structured sources only', async () => {
    const f = fixture(() => Response.json({ results: [{url:'https://a.test/p#frag',title:'A',snippet:'snippet',published_at:'2026-01-01'}, {url:'https://a.test/p',title:'duplicate'}, {url:'mailto:x',title:'invalid'}] }));
    expect(await adapter.search(f.ctx,f.conn,req())).toEqual({results:[{url:'https://a.test/p',title:'A',description:'snippet',publishedAt:'2026-01-01'}]});
    expect(f.calls).toHaveLength(1); const [url, init] = f.calls[0]!;
    expect(url).toBe(target); expect(init.method).toBe('POST'); expect(new Headers(init.headers).get('chatgpt-account-id')).toBe('account-A');
    expect(JSON.parse(init.body)).toEqual({ id: expect.any(String),model:'selected',input:'public phrase',commands:{search_query:[{q:'public phrase'}],response_length:'short'},settings:{allowed_callers:['direct'],external_web_access:true},max_output_tokens:4096 });
});
test('empty results are valid; malformed, oversized chunked and HTTP failures never retry', async () => {
    const f = fixture(() => Response.json({results:[]})); expect(await adapter.search(f.ctx,f.conn,req())).toEqual({results:[]});
    for(const reply of [() => new Response('{'), () => Response.json({answer:'https://x.test'}), () => new Response('private fixture',{status:403}), () => new Response(new ReadableStream({ start(c){ c.enqueue(new Uint8Array(700000)); c.enqueue(new Uint8Array(400000)); c.close(); } }))]) {
        const f = fixture(reply); await expect(adapter.search(f.ctx,f.conn,req())).rejects.toThrow(/Codex search/); expect(f.calls).toHaveLength(1);
    }
});
test('deadline and abort cancel a pending stream', async () => {
    for(const mode of ['abort','deadline']) { let cancelled=false; const ac=new AbortController(); const f=fixture(() => new Response(new ReadableStream({pull(){ if(mode==='abort') queueMicrotask(()=>ac.abort()); }, cancel(){cancelled=true;} })));
        await expect(adapter.search(f.ctx,f.conn,{...req(),deadline:Date.now()+50,signal:ac.signal})).rejects.toThrow(); expect(cancelled).toBe(true);
    }
});
test('unbranded/retained connection and forged proof cannot read credentials or send', async () => {
    const f=fixture(()=>Response.json({results:[]})); await expect(adapter.binding.read(f.ctx,f.conn,{...f.proof})).rejects.toThrow();
    f.state.models.nativeSearchReads.set(f.proof,{}); await expect(adapter.binding.read(f.ctx,f.conn,f.proof)).rejects.toThrow();
    f.state.models.nativeSearchConnections.delete(f.conn); await expect(adapter.search(f.ctx,f.conn,req())).rejects.toThrow(); expect(f.reads()).toBe(0); expect(f.calls).toHaveLength(0);
});
test('credential access rejects unknown account, stale revision, replacement generation and near expiry', async () => {
    for(const change of ['unknown','renewed','replaced','expiry']) { const f=fixture(()=>Response.json({results:[]}));
        if(change==='unknown') f.value.accountId=''; if(change==='renewed') f.row.codex_credential_revision++; if(change==='replaced') f.row.codex_generation='B'; if(change==='expiry') f.value.expiresAt=Date.now()+5000;
        await expect(adapter.search(f.ctx,f.conn,req())).rejects.toThrow(); expect(f.calls).toHaveLength(0);
    }
});
test('same generation, newly verified revision uses new account token; late 401 is a no-op after relogin or rotation', async () => {
    for(const mode of ['relogin','rotation','unchanged']) { let release!: (r:Response)=>void, sent!:()=>void; const started=new Promise<void>(r=>sent=r); const f=fixture(()=>{sent(); return new Promise<Response>(r=>release=r);});
        f.proof.revision='10'; f.row.codex_credential_revision=10; f.value.accessToken='new fixture';
        const pending=adapter.search(f.ctx,f.conn,req()); await started; expect(new Headers(f.calls[0]![1].headers).get('authorization')).toBe('Bearer new fixture');
        if(mode==='relogin')f.row.codex_generation='new generation of same account'; if(mode==='rotation')f.row.codex_credential_revision++;
        release(new Response('sensitive detail',{status:401})); await expect(pending).rejects.toThrow('Codex search HTTP 401'); expect(f.writes()).toBe(mode==='unchanged'?1:0);
    }
});
test('selected transport carries one alpha request; proxy failure and redirect do not retry directly',async()=>{
    const direct = spyOn(globalThis,'fetch').mockImplementation((async (url,init) => {
        expect(String(url)).toBe(target); expect(init?.redirect).toBe('error'); return Response.json({results:[]});
    }) as typeof fetch);
    try {
        for(const kind of ['direct','socks','ssh-tunnel'] as const) {
            let proxies=0;
            const t=kind==='direct'?{kind}:kind==='socks'?{kind,proxyId:'saved'}:{kind,instance:'fixture'};
            const ctx={state:{models:{}},fns:{socksProxy:{readSaved:async()=>({host:'127.0.0.1',port:1080}),request:async(o:{url:string;method:string})=>{proxies++; expect(o.url).toBe(target); expect(o.method).toBe('POST'); if(kind==='socks')throw Error('refused'); return new Response(null,{status:302,headers:{location:'https://other.invalid'}});}},sshProvider:{tunnel:async()=>({port:1080,signal:new AbortController().signal,release:()=>{}})}}} as unknown as Context;
            const f=fixture(()=>{throw Error('unused');},(url,init)=>transport(ctx,null,{url,init,transport:t}));
            if(kind==='direct')expect(await adapter.search(f.ctx,f.conn,req())).toEqual({results:[]});
            else await expect(adapter.search(f.ctx,f.conn,req())).rejects.toThrow();
            expect(proxies).toBe(kind==='direct'?0:1); expect(direct).toHaveBeenCalledTimes(1);
        }
    }finally{direct.mockRestore();}
});
test('only exact alpha POST admitted across SSH and isolated route guards',async()=>{
    const ctx={} as Context;
    for(const [url,method,ok] of [[target,'POST',true],[target,'GET',false],[`${target}?`,'POST',false],[`${target}?q=foo`,'POST',false],[target+'/', 'POST', false],[target.replace('chatgpt.com','example.test'),'POST',false],[target.replace('/alpha/','/x/../alpha/'),'POST',false]] as const){
        const a=()=>ssh(ctx,null,{provider:'codex',url,method}), b=()=>endpoint(ctx,null,{raw:url,method}), c=()=>validate(ctx,null,{url,method});
        if(ok){expect(a().href).toBe(target); expect(b()).toBe(true); expect((await c()).method).toBe('POST');}else{expect(a).toThrow();expect(b).toThrow();await expect(c()).rejects.toThrow();}
        await expect(isolated(ctx,null,{url,method,proxyPort:0})).rejects.toThrow(ok?'proxy port':/destination|refused/i);
    }
});
