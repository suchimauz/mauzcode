import { expect, test } from 'bun:test';
import build from './buildLlmRequest';
import compact from '../compaction/$compaction_default';
import input from '../models/provider/codex/codexInput';
import anthropic from '../models/protocol/anthropic/toAnthropicMessages';
import checkInput from '../models/inference/checkInput';
import failure from '../models/inference/failure';
import stream from '../models/inference/stream';

const item = { type: 'compaction', id: 'opaque-id', encrypted_content: 'encrypted/signed+payload==' };
const checkpoint = { kind: 'native-checkpoint', version: 1, provider: 'codex', connectionId: 'c', model: 'm', payload: item };
function fixture(content: unknown = JSON.stringify(checkpoint), type = 'codex_compaction') {
    const messages = [{ role: 'user', content, message_type: type }, { role: 'user', content: 'next' }];
    const agent: any = { id: 'a', model: 'codex/work:m', messages, scratchpad: {} };
    let wire: any;
    const route = { provider: 'codex', connectionId: 'c', model: 'm', nativeCompaction: true };
    const definition: any = { capabilities: { checkpoints: true, continuationState: true }, stream: (_ctx: any, _conn: any, req: any) => { wire = input(ctx, null, { messages: req.messages }); return { text: 'ok' }; } };
    const ctx: any = { state: { models: { providers: { codex: { definition } } } }, fns: {
        agent: { requireModel: ({model}: any) => model, fullSystemPrompt: async () => '', normalizeSleepContext: () => null, selectJevContext: async ({messages}: any) => messages },
        session: { repairToolPairs: ({messages}: any) => ({messages,repaired:[]}) },
        compaction: { project: async () => ({ messages, mode:'compact', fallback:null, revision:1 }) },
        auth: { attributeMessages: async ({messages}: any) => ({messages,applied:false}) },
        attachments: { resolveContent: async ({messages}: any) => messages }, planning: { prompt: async () => '' },
        models: { resolveRoute: async () => route, inference: { failure: (o: any) => failure(ctx,null,o), checkInput: (o: any) => checkInput(ctx,null,o), assertModelEnabled: async () => ({id:'c',provider:'codex'}) }, connections: { safeMessage: ({message}:any)=>message, resolve: async () => ({definition,conn:{}}) }, compact: async (o: any) => { wire=input(ctx,null,{messages:o.messages}); return { item, checkpoint, responseId:'r' }; } },
    } };
    return {ctx,agent,route,wire:()=>wire};
}
test('persisted checkpoint survives real request assembly and models stream, including a new run', async () => {
    const f=fixture(); const request=await build(f.ctx,null,{agent:f.agent,preview:true});
    expect(request.messages[0]).toEqual({type:'checkpoint',checkpoint});
    for(const runId of ['run1','run2']) {
        await stream(f.ctx,null,{connectionId:'c',model:'m',instructions:request.instructions,messages:request.messages,sessionId:'a',runId});
        expect(f.wire().input[0]).toEqual(item);
    }
    expect(request).not.toHaveProperty('state');
});
test('repeat native compaction replays persisted envelope, not a legacy marker or continuation',async()=>{
    const f=fixture(); const result=await compact(f.ctx,null,{model:f.agent.model,sessionId:'child',instructions:'',messages:f.agent.messages});
    expect(JSON.parse(String(result.message.content))).toEqual(checkpoint);
    expect(f.wire().input[0]).toEqual(item);
});
test('malformed or foreign opaque checkpoints fail closed without leaking payload',async()=>{
    for(const bad of ['{',JSON.stringify(item),JSON.stringify({...checkpoint,connectionId:'other'}),JSON.stringify({...checkpoint,model:'other'}),JSON.stringify({...checkpoint,payload:{...item,encrypted_content:''}})]) {
        const f=fixture(bad); await expect(build(f.ctx,null,{agent:f.agent,preview:true})).rejects.toThrow(/checkpoint/);
        expect(f.wire()).toBeUndefined();
    }
    const f=fixture(); const request=await build(f.ctx,null,{agent:f.agent,preview:true});
    await expect(stream(f.ctx,null,{connectionId:'c',model:'other',instructions:'',messages:request.messages,sessionId:'a'})).rejects.toMatchObject({code:'INVALID_INPUT'});
    await expect(stream(f.ctx,null,{connectionId:'c',model:'m',instructions:'',messages:request.messages,sessionId:'a',runId:'new',state:{provider:'codex',connectionId:'c',sessionId:'a',runId:'old',data:{previousResponseId:'opaque'}}})).rejects.toMatchObject({code:'INVALID_INPUT'});
    expect(f.wire()).toBeUndefined();
});
test('Claude signed checkpoint survives request assembly and protocol; malformed blocks fail closed',async()=>{
    const signed={type:'compaction',content:'summary',signature:'signed+opaque=='};
    const f=fixture(JSON.stringify(signed),'anthropic_compaction');
    const request=await build(f.ctx,null,{agent:f.agent,preview:true});
    const wire=anthropic(f.ctx,null,{messages:request.messages});
    expect(wire[0]?.content[0]).toEqual(signed);
    for(const content of ['{',JSON.stringify({...signed,signature:''}),JSON.stringify({...signed,content:''})]) expect(()=>anthropic(f.ctx,null,{messages:[{role:'user',message_type:'anthropic_compaction',content}]})).toThrow('Malformed persisted Claude checkpoint');
});
