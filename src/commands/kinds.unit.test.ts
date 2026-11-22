import {expect, test} from 'bun:test';
import action from './$commandKind_action';
import client from './$commandKind_client';
import prompt from './$commandKind_prompt';
import enqueue from './enqueue';
import dispatch from './dispatch';
import parse from './parse';
import finishOperation from './finishOperation';

function fixture(kind = 'prompt') {
    const command = {name:'test:run', kind, label:'Run', description:'Run a test', template:'{{args}} {{other}} {{args}}', fn:'test.run', clientAction:'attach-file'};
    const messages: any[] = [], events: any[] = [];
    let row: any;
    let queued = 0;
    const target = Object.assign(async () => ({status:'running',result:{progress:0}}), {meta:{optsType:'types.commands.ActionInput',returnType:'Promise<types.commands.ActionResult>'}});
    const ctx: any = {state:{registry:{test:{run:target}}, commands:{registry:{'test:run':command}, kinds:{prompt,action,client}}}, fns:{}};
    ctx.fns = {test:{run:target},procs:{events:{refresh(){}},db:{transaction:({fn}:any)=>fn(), select:async ({sql}:any)=>sql.includes('SELECT command_text') ? (row?[row]:[]) : sql.includes('FROM agents') ? [{id:'a'}] : [],run:async({sql,params:p}:any)=>{
        if(sql.startsWith('INSERT INTO agent_command_requests')) row={command_text:p[2],result:JSON.parse(p[3])};
        else if(sql.startsWith('UPDATE agent_command_requests')) row.result=JSON.parse(p[0]);
        else if(sql.startsWith('UPDATE agents')) queued++; else throw Error(sql);
    }}}, commands:{candidates:async()=>[{command,enabled:true}],parse:(o:any)=>parse(ctx,null,o),enqueue:(o:any)=>enqueue(ctx,null,o),recordEvent:(o:any)=>events.push(o),finishOperation:(o:any)=>finishOperation(ctx,null,o)},session:{appendMessage:({message}:any)=>{messages.push(message);return {idx:2}},appendEvent:({event}:any)=>events.push(event)},agent:{wakeWorker(){}}};
    const run = (text='  /test:run $& {{args}}\nnext  ')=>dispatch(ctx,null,{text,agentId:'a',requestId:'k'});
    return {ctx,command,run,events,messages,queued:()=>queued};
}
test('prompt only expands {{args}} literally and stores original typed text with the rendered human turn',async()=>{
    const f=fixture();expect(await f.run()).toMatchObject({status:'completed',scheduled:true,messageIdx:2});
    expect(await f.run()).toMatchObject({duplicate:true});
    expect(f.messages).toEqual([{role:'user',message_type:'message',content:'$& {{args}}\nnext {{other}} $& {{args}}\nnext'}]);
    expect(f.events[1]).toMatchObject({type:'user',messageIdx:2,command:{kind:'prompt',text:'  /test:run $& {{args}}\nnext  '}}); expect(f.queued()).toBe(1);
});
test('client declarations are allow-listed and rejected before any dispatch effects',async()=>{
    const f=fixture('client'); expect(()=>client.validate({...f.command,clientAction:'eval'} as any)).toThrow();
    await expect(f.run()).rejects.toMatchObject({status:400,code:'client_only'});expect(f.events).toHaveLength(0);
});
test('only opted-in actions can run; deferred result can finish later exactly once',async()=>{
    const f=fixture('action'); expect(()=>action.validate({...f.command,fn:'test.noSuch'} as any,f.ctx)).toThrow();
    f.ctx.state.registry.test.ordinary=()=>{};expect(()=>action.validate({...f.command,fn:'test.ordinary'} as any,f.ctx)).toThrow();
    const first=await f.run();expect(first).toMatchObject({status:'running',result:{progress:0}});expect(await f.run()).toMatchObject({status:'running',duplicate:true});
    const done={agentId:'a',requestId:'k',operationId:first.operationId as string,outcome:{status:'completed' as const,result:{progress:100}}};
    await finishOperation(f.ctx,null,done);await finishOperation(f.ctx,null,done);expect(await f.run()).toMatchObject({status:'completed',duplicate:true,result:{progress:100}});expect(f.events.map(e=>e.type)).toEqual(['command_invocation','command_result']);
});
