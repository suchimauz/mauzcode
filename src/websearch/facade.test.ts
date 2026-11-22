import { expect, test } from 'bun:test';
import { sdkCtx } from '../../plugins/websearch/src/websearch/sdkFixture.entry';
import answer from './answer';
import fetchPage from './fetch';
import read from './read';
import requireAccess from './requireAccess';

const url = 'https://pages.test/source';
const sources = [ {url:'javascript:bad',title:'bad'}, {url:url+'#one',title:'<b>One</b>',description:'  A &amp; B '}, {url:url+'#two',title:'duplicate'}, {url:url+'/two',title:'Two'}, {url:url+'/three',title:'Three'} ];
function fixture() {
    const ctx = sdkCtx();
    const calls: {query:string;limit:number}[] = [];
    const models = ctx.registry.models as any;
    models.nativeSearch.search = (_c: Context, _s: Session|null, request: {query:string;limit:number}) => {
        expect(ctx.state.models.nativeSearchQueries!.has(request)).toBe(true);
        calls.push(request);
        return { engine:'native:issuer', results:sources };
    };
    return {ctx, calls, models};
}
test('only an implicit engine asks the bound model; native results use the ordinary normalizer', async () => {
    const {ctx,calls,models} = fixture();
    const found = await ctx.fns.websearch.search({query:' hot ',limit:2});
    expect(found.engine).toBe('native:issuer');
    expect(found.results.map(r=>[r.url,r.title,r.description])).toEqual([[url,'One','A & B'],[url+'/two','Two','']]);
    expect(await ctx.fns.websearch.search({query:'q',engine:'google-browser'})).toHaveProperty('engine','google-browser');
    await expect(ctx.fns.websearch.search({query:'q',engine:'native:issuer'})).rejects.toThrow('unknown engine');
    await expect(ctx.fns.websearch.search({query:' '})).rejects.toThrow('required');
    expect(calls).toEqual([{query:'hot',limit:2}]); expect(ctx.state.models.nativeSearchQueries!.has(calls[0]!)).toBe(false);
    models.nativeSearch.search = () => ({engine:'native:issuer',results:[]});
    expect((await ctx.fns.websearch.search({query:'q'})).results).toEqual([]);
    models.nativeSearch.search = () => {throw new Error('binding unavailable')};
    await expect(ctx.fns.websearch.search({query:'q'})).rejects.toThrow('binding unavailable');
});
test('answer uses the issuing native engine and the chosen synthesis model; read and fetch never search',async()=>{
    const {ctx,calls,models} = fixture(); const routes:string[]=[]; const pages:string[]=[];
    ctx.registry.websearch!.read = read as any;
    ctx.registry.browser!.navigate = (_c,_s,o) => {pages.push(o.url)};
    ctx.registry.browser!.snapshot = () => ({url,title:'One',content:'A relevant quote.',truncated:true});
    ctx.registry.browser!.tabClose = async () => {};
    models.resolveRoute = (_c:Context,_s:Session|null,o:{route:string})=>{routes.push(o.route);return {connectionId:'synth',model:'other'}};
    models.call=()=>({text:JSON.stringify({answer:'Grounded.',citations:[{url,quote:'A relevant quote.'}]})});
    await answer(ctx,null,{question:'Question?',model:'synth:other',pages:1,requireVerified:true});
    await read(ctx,null,{url}); await fetchPage(ctx,null,{url,prompt:'quote',model:'synth:other'});
    expect(calls).toEqual([{query:'Question?',limit:1}]); expect(routes).toEqual(['synth:other','synth:other']); expect(pages).toEqual([url,url,url]);
});
test('nested answer checks search permission before any provider, setting or credential lookup',async()=>{
    const names:string[]=[]; const session={agent:{preset:{}}} as Session;
    const ctx:any={fns:{plugins:{list:()=>[{name:'websearch'}]},agentPreset:{allows:({name}:{name:string})=>{names.push(name);return name==='websearch.answer'}},websearch:{requireAccess:(o:{name:string})=>requireAccess(ctx,session,o)}}};
    await expect(answer(ctx,session,{question:'Q'})).rejects.toThrow('websearch.search is not available');
    expect(names).toEqual(['websearch.answer','websearch.search']);
    ctx.fns.plugins.list=()=>[];
    await expect(requireAccess(ctx,null,{name:'websearch.search'})).rejects.toThrow('is not available');
});
