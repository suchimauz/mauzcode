import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import emit from './desktopOccurrence';
import access from './desktopAccess';

test('canonical ownership, input state, session identity and fenced idle completion',async()=>{
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE users(id text,disabled_at integer); CREATE TABLE agents(id text,created_by text,parent_id text,archived_at integer,stopped_at integer,visibility text,updated_at integer,run_state text,run_token text,next_run_at integer,wake_at integer,last_error text); CREATE TABLE inputs(agent_id text,id text,state text); INSERT INTO users VALUES ('alice',NULL),('bob',NULL); INSERT INTO agents VALUES ('one','alice',NULL,NULL,NULL,'nav',10,'idle',NULL,NULL,NULL,NULL); INSERT INTO inputs VALUES ('one','i','open');`);
 const ids:string[]=[]; let user:string|null='alice';
 const ctx:any={state:{events:{desktopListeners:new Map([['alice',new Set([(id:string)=>ids.push(id)])],['bob',new Set([()=>{throw Error('other listener')}])]])}},fns:{auth:{currentUser:async()=>({user:user?{id:user}:null,required:true})},webPush:{sessionBinding:async()=>({ownerId:user,key:'scope-'+user,expiresAt:Date.now()+60000})},procs:{db:{select:async({sql,params}:any)=>db.query(sql).all(...params)},auth:{cookieName:()=>'login'}}}};
 const req=new Request('https://example.test/',{headers:{cookie:'login=test'}});
 const event={agentId:'one',kind:'input-pending' as const,token:'i',at:10}; const finished={...event,kind:'run-finished' as const,token:'r'};
 await emit(ctx,null,event); await emit(ctx,null,event); await emit(ctx,null,finished); expect(ids.length).toBe(1);
 const check=(id:string)=>access(ctx,null,{req,id});
 expect((await check(ids[0]!))?.agentId).toBe('one');user='bob';expect(await check(ids[0]!)).toBeNull();user=null;expect(await check(ids[0]!)).toBeNull();user='alice';
 db.exec("UPDATE inputs SET state='closed'"); expect(await check(ids[0]!)).toBeNull(); await emit(ctx,null,{...finished,at:9});expect(ids.length).toBe(1);
 await emit(ctx,null,finished);expect((await check(ids[1]!))?.kind).toBe('run-finished');db.exec("UPDATE agents SET created_by='bob'");expect(await check(ids[1]!)).toBeNull();
 db.close();
});
