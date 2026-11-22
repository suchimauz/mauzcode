import {expect,test} from 'bun:test';
import {execFileSync} from 'node:child_process';
import {mkTestCtx} from '../../src/_testCtx.entry';

// Exercise the actual pre-controls reader, not today's provider with its controls disabled.
const before='18e341837f4ee6a55296838a471c2cc800979b4d';
async function old(path:string){
    const source=execFileSync('git',['show',`${before}:src/${path}.ts`],{cwd:import.meta.dir,encoding:'utf8'});
    const js=new Bun.Transpiler({loader:'ts'}).transformSync(source);
    return (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).default;
}
test('offline downgrade refuses missing history; two cleanups leave an old binary default request checkpoint-free',async()=>{
    const ctx=await mkTestCtx(),db=ctx.fns.procs.db,id=crypto.randomUUID();
    const cleanup=await Bun.file(new URL('./rollback.sql',import.meta.url)).text();
    const sleep={mode:'compact',activeRevision:1,generations:[{revision:1,sourceOffset:1,tailStart:1,contextMessages:[{message_type:'codex_compaction',role:'user',content:JSON.stringify({kind:'native-checkpoint',version:1,connectionId:id,provider:'codex',model:'m',binding:'account-A-signature',payload:{type:'compaction',encrypted_content:'never-replay'}})}]}]};
    const run=async()=>{const conn=await (await db.conn({})).reserve();
        try {await conn.unsafe(cleanup);} catch(err){await conn.unsafe('ROLLBACK');throw err;} finally {conn.release();}};
    {
        await db.run({sql:`INSERT INTO llm_connections(id,provider,account_name,codex_generation,models_cache_generation,models_cache,created_at,updated_at) VALUES(?,'codex','fixture','B','A','[{"id":"m","reasoning":{"supported":["max"]}}]',0,0)`,params:[id]});
        await db.run({sql:`INSERT INTO agents(id,model,reasoning_effort,sleep_context,created_at,updated_at) VALUES('chat','codex/fixture:m','max',?::jsonb,0,0),('other','mock/default:m','high',null,0,0)`,params:[JSON.stringify(sleep)]});
        await expect(run()).rejects.toThrow(/Rollback blocked.*chat/);
        expect((await db.select({sql:"SELECT reasoning_effort FROM agents WHERE id='chat'"}))[0].reasoning_effort).toBe('max');
        await db.run({sql:"INSERT INTO messages(agent_id,idx,role,content,ts) VALUES('chat',0,'user','hello',0)"});
        const messages=await ctx.fns.session.getMessages({id:'chat'});
        const digest=ctx.fns.compaction.historyDigest({messages});
        await db.run({sql:"UPDATE agents SET sleep_context=jsonb_set(sleep_context,'{generations,0,sourceDigest}',to_jsonb(?::text)) WHERE id='chat'",params:[digest]});
        // All simulated writers are now stopped and no inference is pending.
        await run();await run();
        const [chat,other]=await db.select({sql:'SELECT * FROM agents ORDER BY id'});
        expect(chat.reasoning_effort).toBe('auto');expect(other.reasoning_effort).toBe('high');
        expect((await db.select({sql:'SELECT models_cache FROM llm_connections WHERE id=?',params:[id]}))[0].models_cache).toBeNull();
        const projection=await (await old('compaction/project'))(ctx,null,{model:chat.model,sleepContext:chat.sleep_context,messages});
        expect(projection.mode).toBe('full');expect(projection.messages).toEqual(messages);
        const codex=ctx.state.registry.models.provider.codex;
        codex.codexInput=await old('models/provider/codex/codexInput');codex.codexWireResponses=await old('models/provider/codex/codexWireResponses');
        codex.codexWireAuth=async()=>({token:'fake',accountId:'B'});codex.codexVersion=async()=>'fixture';
        const bodies:any[]=[];
        await (await old('models/provider/codex/codexStream'))(ctx,null,{conn:{id,provider:'codex',config:{},fetch:async(_:string,init:RequestInit)=>{
            expect(new Headers(init.headers).get('chatgpt-account-id')).toBe('B');bodies.push(JSON.parse(String(init.body)));
            return new Response('data: {"type":"response.completed","response":{}}\n\n');}},req:{sessionId:'chat',model:'m',instructions:'',messages:projection.messages,reasoning:{applied:'medium'}}});
        expect(bodies).toHaveLength(1);expect(bodies[0].service_tier).toBeUndefined();expect(bodies[0].text.verbosity).toBe('medium');
        expect(JSON.stringify(bodies[0])).toContain('hello');expect(JSON.stringify(bodies[0])).not.toContain('never-replay');
    }
});
