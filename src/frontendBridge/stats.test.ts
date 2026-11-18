import {describe,test,expect,afterEach} from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';
import stats from './statsData';
import middleware from '../$middleware_ui-lab-api';
let serial=0; const session:any={user:{id:'owner-a'}};
const realNow=Date.now; afterEach(()=>{Date.now=realNow;});
function fixture(agents:any[]=[],messages:any[]=[],events:any[]=[]){const calls:any[]=[];const owner='owner-'+(++serial);session.user.id=owner;const ctx:any={fns:{auth:{listUsers:async()=>[{id:owner,role:'owner'}]},procs:{db:{select:async(o:any)=>{calls.push(o);return o.sql.includes('FROM agents a')?agents:o.sql.includes('FROM messages m')?messages:events;}}}}};return {ctx,calls};}
test('SQL attributes an archived session to its recorded requests, not its session model', async () => {
 const dbCtx = await mkTestCtx(); const {ctx}=fixture(); ctx.fns.procs.db=dbCtx.fns.procs.db;
 const id='stats-archived-history',now=Date.now();
 await dbCtx.fns.procs.db.run({sql:"INSERT INTO agents (id,model,visibility,created_at,updated_at,archived_at) VALUES (?,NULL,'nav',?,?,?)",params:[id,now,now,now]});
 await dbCtx.fns.session.appendMessage({id,message:{role:'user',content:'Hello'}});
 for(const model of ['mock/a:first','mock/b:second','mock/b:second',null,null,null]){
  await dbCtx.fns.session.appendEvent({id,event:{type:'context_usage',model,usage:{prompt_tokens:1,completion_tokens:2}}});
 }
 const r=await stats(ctx,session,{});
 expect(r.favoriteModel).toBe('second');expect(r.models.map(m=>[m.model,m.requests,m.totalTokens])).toEqual([['second',2,6],['first',1,3]]);
 expect(r.messages).toBe(1);expect(r.totalTokens).toBe(18);
});
describe('owner stats',()=>{
 test('requires session before any database read',async()=>{const {ctx,calls}=fixture();await expect(stats(ctx,null,{})).rejects.toThrow('Unauthorized');expect(calls).toHaveLength(0);});
 test('rejects invalid range and timezone',async()=>{const {ctx}=fixture();await expect(stats(ctx,session,{range:'bad' as any})).rejects.toThrow('Invalid');await expect(stats(ctx,session,{timezone:'nonsense'})).rejects.toThrow('Invalid');});
 test('empty known counts zero but unknown usage and favorites null',async()=>{const {ctx,calls}=fixture();const r=await stats(ctx,session,{});expect(r.sessions).toBe(0);expect(r.messages).toBe(0);expect(r.totalTokens).toBeNull();expect(r.favoriteModel).toBeNull();expect(r.peakHour).toBeNull();expect(calls).toHaveLength(3);for(const c of calls){expect(c.sql).toContain("a.visibility='nav'");expect(c.sql).toContain('a.created_by=?');expect(c.params.slice(0,3)).toEqual([session.user.id,session.user.id,session.user.id]);expect(c.sql).toContain('LIMIT ');expect(c.sql).not.toMatch(/INSERT|UPDATE|DELETE/);}});
 test('aggregates recorded usage and marks missing usage',async()=>{const date=new Date().toISOString().slice(0,10);const {ctx}=fixture([{date,n:1,source_count:1}],[{date,hour:5,model:'m',n:2,source_count:2}],[{date,model:'m',known:1,missing:1,input:10,output:5,total:15,source_count:2}]);const r=await stats(ctx,session,{range:'7d'});expect(r.sessions).toBe(1);expect(r.messages).toBe(2);expect(r.totalTokens).toBe(15);expect(r.inputTokens).toBe(10);expect(r.outputTokens).toBe(5);expect(r.activeDays).toBe(1);expect(r.favoriteModel).toBe('m');expect(r.daily[0]?.models).toEqual([{model:'m',totalTokens:15}]);expect(r.usageCoverage).toEqual({known:1,missing:1,historicalCompleteness:'unknown'});});
 test('timezone controls peak hour, all retains historical daily',async()=>{const {ctx}=fixture([],[{date:'2020-01-02',hour:8,model:'m',n:1,source_count:1}]);const r=await stats(ctx,session,{timezone:'Asia/Tokyo'});expect(r.peakHour).toBe(8);expect(r.daily[0]?.date).toBe('2020-01-02');const recent=await stats(ctx,session,{range:'7d'});expect(recent.messages).toBe(0);});
 test('capacity is refused rather than truncated',async()=>{const {ctx}=fixture([{source_count:10001}]);await expect(stats(ctx,session,{})).rejects.toThrow('capacity');});
 test('cold single flight, warm cache, stale refresh and auth before cache',async()=>{const {ctx,calls}=fixture();let now=realNow();Date.now=()=>now;const [a,b]=await Promise.all([stats(ctx,session,{}),stats(ctx,session,{})]);expect(a).toEqual(b);expect(calls).toHaveLength(3);await stats(ctx,session,{});expect(calls).toHaveLength(3);await expect(stats(ctx,null,{})).rejects.toThrow('Unauthorized');now+=46000;const stale=await stats(ctx,session,{});expect(stale.refreshing).toBe(true);expect(stale.asOf).toBe(a.asOf);await Bun.sleep(5);expect((await stats(ctx,session,{})).refreshing).toBe(false);expect(calls).toHaveLength(6);});
 test('failed stale refresh retains snapshot and backs off; cold errors retry',async()=>{const {ctx,calls}=fixture();let now=realNow();Date.now=()=>now;const a=await stats(ctx,session,{});const select=ctx.fns.procs.db.select;ctx.fns.procs.db.select=async()=>{throw Error('offline');};now+=46000;expect((await stats(ctx,session,{})).refreshing).toBe(true);await Bun.sleep(5);const b=await stats(ctx,session,{});expect(b.asOf).toBe(a.asOf);expect(b.refreshing).toBe(false);ctx.fns.procs.db.select=select;now+=11000;await stats(ctx,session,{});await Bun.sleep(5);expect((await stats(ctx,session,{})).asOf).not.toBe(a.asOf);});
 test('first owner change invalidates cache, canonical aliases share',async()=>{const {ctx,calls}=fixture();await stats(ctx,session,{timezone:'UTC'});const alias=await stats(ctx,session,{timezone:'Etc/UTC'});expect(alias.timezone).toBe('Etc/UTC');expect(calls).toHaveLength(3);ctx.fns.auth.listUsers=async()=>[{id:'another',role:'owner'}];await stats(ctx,session,{});expect(calls).toHaveLength(6);});
 test('route requires auth, GET and valid inputs',async()=>{const req=(s:string,method='GET')=>new Request('http://localhost/ui-lab-api/stats'+s,{method});expect((await middleware({} as any,null,{req:req('')})).status).toBe(401);expect((await middleware({} as any,session,{req:req('','POST')})).status).toBe(405);expect((await middleware({} as any,session,{req:req('?range=bad')})).status).toBe(400);expect((await middleware({} as any,session,{req:req('?timezone=bad')})).status).toBe(400);expect((await middleware({} as any,session,{req:req('?range=all&range=7d')})).status).toBe(400);});
 test('route passes exact parameters and disables caching',async()=>{let seen:any;const ctx:any={fns:{frontendBridge:{statsData:async(o:any)=>{seen=o;return {sessions:3};}}}};const r=await middleware(ctx,session,{req:new Request('http://localhost/ui-lab-api/stats?range=30d&timezone=Asia%2FTokyo')});expect(r.status).toBe(200);expect(r.headers.get('Cache-Control')).toBe('no-store');expect(seen).toEqual({range:'30d',timezone:'Asia/Tokyo'});expect(await r.json()).toEqual({sessions:3});});
});
describe('model grouping',()=>{
 const date=new Date().toISOString().slice(0,10);
 const usage=(model:unknown,known:number,missing:number,input:number,output:number)=>({date,model,known,missing,input,output,total:input+output,source_count:known+missing});
 test('merges routes across providers and ranks requests even without token counts',async()=>{
  const {ctx}=fixture([],[],[usage('ssh/host:codex/acc1:gpt-x',1,1,10,5),usage('mauzcode/mini:codex/acc2:gpt-x',1,2,20,5),usage('oneapi:qwen',0,4,0,0)]);
  const r=await stats(ctx,session,{});
  expect(r.models.map(m=>m.model)).toEqual(['gpt-x','qwen']);expect(r.favoriteModel).toBe('gpt-x');
  expect(r.models[0]).toMatchObject({requests:5,totalTokens:40,inputTokens:30,outputTokens:10});
  expect(r.models[1]?.totalTokens).toBeNull();expect(r.daily[0]?.models).toEqual([{model:'gpt-x',totalTokens:40}]);
 });
 test('merges request routes with a shared display name',async()=>{
  const {ctx}=fixture([],[],[usage('claude/one:claude-opus-4-5',2,0,8,2),usage('custom/gate:anthropic/claude-opus-4.5',1,0,4,1)]);
  ctx.fns.models={displayNames:async({routes}:any)=>Object.fromEntries(routes.map((r:string)=>[r,'Claude Opus 4.5']))};
  const r=await stats(ctx,session,{});expect(r.models.map(m=>m.model)).toEqual(['Claude Opus 4.5']);expect(r.models[0]?.requests).toBe(3);expect(r.favoriteModel).toBe('Claude Opus 4.5');
 });
 test('unattributed requests and messages contribute only to overall and daily totals',async()=>{
  const {ctx}=fixture([],[{date,hour:5,n:20,source_count:20}],[null,undefined,'','  ','null'].map(m=>usage(m,1,0,10,5)));
  const r=await stats(ctx,session,{});expect(r.messages).toBe(20);expect(r.totalTokens).toBe(75);expect(r.favoriteModel).toBeNull();expect(r.models).toEqual([]);
  expect(r.daily[0]).toMatchObject({messages:20,totalTokens:75,models:[]});
 });
});
