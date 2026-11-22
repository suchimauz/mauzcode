import {expect,test} from 'bun:test';
import {resolve} from 'node:path';
import {testCtx} from '../$test';
import load from './$loader_websearchProvider';

test('mounted ordinary engines retain physical ownership and old persisted settings through declaration reload and unmount',async()=>{
    const ctx=await testCtx({env:{PROCS_PLUGINS:'./plugins',USER_PLUGINS:resolve(import.meta.dir,'../../test/fixtures/websearch-plugins'), WEBSEARCH_DEFAULT_ENGINE:'', WEBSEARCH_BRAVE_API_KEY:'', WEBSEARCH_FIXTURE_TOKEN:'fixture-only'}});
    const modules=ctx.fns.procs.modules.list({});
    const plugin=modules.find(m=>m.name==='websearch' && m.plugin)!;
    expect(plugin.fns).toContain('websearch.braveSearch'); expect(plugin.fns).not.toContain('websearch.search');
    const ids=await ctx.fns.websearch.providerIds({}); expect(ids).toEqual(['acme-search','brave','google-browser','openserp']);
    const fresh=await ctx.fns.plugins.configuration({name:'websearch'});
    expect(fresh.settings.find(s=>s.key==='defaultEngine')?.descriptor.options).toEqual(ids);
    // These are the exact pre-promotion storage keys and reference format. No migration or secret copy.
    for(const [key,value,secret] of [['defaultEngine','openserp',0],['braveApiKey','env://WEBSEARCH_FIXTURE_TOKEN',1]] as const) {
        await ctx.fns.procs.db.run({sql:`INSERT INTO settings(module,scope_type,scope_id,key,value,is_secret,updated_at) VALUES ('websearch','global','',?,?,?,?)`,params:[key,JSON.stringify(value),secret,Date.now()]});
    }
    const upgraded=await ctx.fns.plugins.configuration({name:'websearch'});
    expect(upgraded.settings.find(s=>s.key==='braveApiKey')).toMatchObject({configured:true,secret:true});
    expect(JSON.stringify(upgraded)).not.toContain('WEBSEARCH_FIXTURE_TOKEN');
    const listed=await ctx.fns.websearch.providers({});expect(listed[0]).toMatchObject({id:'openserp',isDefault:true});expect(listed.find(p=>p.id==='brave')?.configured).toBe(true);
    await ctx.fns.plugins.saveConfiguration({name:'websearch',values:{'websearch.defaultEngine':'acme-search'}});
    await expect(ctx.fns.plugins.saveConfiguration({name:'websearch',values:{'websearch.defaultEngine':'native:codex'}})).rejects.toThrow('Invalid enum option');
    const result=await ctx.fns.websearch.search({query:'fixture'});
    expect(result.results).toEqual([{url:'https://acme.test/page',title:'Acme',description:'',descriptionHtml:null,extraSnippets:[],language:null,publishedAt:null,site:null}]);
    const declarations=ctx.state.procs.boot.entries!.filter(e=>e.kind==='websearchProvider');
    expect((await load(ctx,null,{entries:declarations})).registered.sort()).toEqual(ids);
    ctx.state.procs.modules=modules.filter(m=>m.name!=='acme');
    await load(ctx,null,{entries:declarations.filter(e=>e.root!=='acme')});
    expect(await ctx.fns.websearch.providerIds({})).toEqual(['brave','google-browser','openserp']);
    expect(ctx.state.registry.websearch.search).toBeFunction();
},30_000);
