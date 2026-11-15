import { expect, test } from 'bun:test';
import build from './buildLlmRequest';
import retry from './retrySchedule';
import retryWait from './retryWait';
import retryDecision from './retryDecision';
import retryCodes from './retryCodes';
import setReasoning from './setReasoningEffort';
import setModel from './setModel';
import claudeList from '../models/provider/claude/claudeListModels';
import claudeReasoning from '../models/inference/resolveReasoningEffort';
import claudeFailure from '../models/provider/claude/claudeWireFailure';
import classifyClaude from '../models/provider/claude/classifyError';
import codexFailure from '../models/provider/codex/codexFailure';
import failure from '../models/inference/failure';
import park from './parkOnUsageLimit';

function failureCtx() {
 const ctx: any = { fns: { models: { connections: { safeMessage: ({message}:any)=>message }, inference: {}, provider: { claude: { classifyError:(o:any)=>classifyClaude(ctx,null,o), claudeAuth:async()=>{} } } } } };
 ctx.fns.models.inference.failure = (o:any)=>failure(ctx,null,o);
 return ctx;
}
async function thrown(p:Promise<unknown>) {try {await p;throw Error('expected failure');}catch(e:any){return e;}}
// Minimal context around the real decision function: it reads the settings chain and
// the code vocabulary, nothing else.
function decisionCtx(ctx: any) { ctx.fns.agent = { retryCodes: (o: any) => retryCodes(ctx, null, o), retryDecision: (o: any) => retryDecision(ctx, null, o) }; return ctx; }
function codesCtx(ctx: any) { ctx.fns.agent = { retryCodes: (o: any) => retryCodes(ctx, null, o) }; return ctx; }

for (const preamble of [undefined, 'descriptor identity']) test(`request descriptor preamble once: ${preamble}`,async()=>{
 const agent:any={id:'a',model:'custom/Asoft LLM Gate:vendor/id:v1',messages:[{role:'user',content:'hello',idx:0}],scratchpad:{}};
 const ctx:any={fns:{attachments:{resolveContent:async({messages}:any)=>messages},auth:{attributeMessages:async({messages}:any)=>({messages,applied:false})},planning:{prompt:async()=>''},compaction:{project:async({messages}:any)=>({messages,mode:'full',fallback:null,revision:null})},agent:{requireModel:({model}:any)=>model,fullSystemPrompt:async()=>preamble?`${preamble}\n${preamble}\nbody`:'body',normalizeSleepContext:()=>null,selectJevContext:async({messages}:any)=>messages},session:{repairToolPairs:({messages}:any)=>({messages,repaired:[]}),getFullMessages:async()=>agent.messages},models:{resolveRoute:async()=>({systemPreamble:preamble})}}};
 const out=await build(ctx,null,{agent,preview:true});
 expect(out.instructions).toBe(preamble??'');expect(out.messages[0].content).toBe('body');
 expect(JSON.stringify(out.messages)).not.toContain('descriptor identity');expect(out.bootstrapMessageCount).toBe(2);
});

test('Claude real catalogue accepts high; unsupported leaves durable and live state unchanged',async()=>{
 let writes=0;const live:any={reasoningEffort:'medium'};
 const ctx:any={state:{agent:{a:live}},fns:{models:{inference:{resolveReasoningEffort:(o:any)=>claudeReasoning(ctx,null,o)},resolveRoute:async()=>({connectionId:'c',model:'claude-opus-5-5'}),listModels:async()=>({models:await claudeList(ctx,null,{})})},procs:{db:{select:async()=>[{model:'claude/account:claude-opus-5-5',reasoning_effort:live.reasoningEffort}],run:async()=>{writes++;}}},session:{appendEvent:async()=>{}},events:{emitAgentsChanged:()=>{}}}};
 expect(await setReasoning(ctx,null,{id:'a',effort:'high'})).toMatchObject({applied:'high',downgraded:false});expect(live.reasoningEffort).toBe('high');
 await expect(setReasoning(ctx,null,{id:'a',effort:'minimal'})).rejects.toThrow('unsupported');expect(writes).toBe(1);expect(live.reasoningEffort).toBe('high');
 const catalogue=await claudeList(ctx,null,{});expect(catalogue.find(m=>m.id==='claude-haiku-4-5')?.reasoning).toBeUndefined();
});

test('disabled model selection fails before any state read or write',async()=>{
 let touches=0;const ctx:any={fns:{models:{resolveRoute:async()=>{throw Object.assign(Error('disabled'),{code:'MODEL_DISABLED_BY_USER'});}},procs:{db:{select:()=>{touches++;},run:()=>{touches++;}}}}};
 await expect(setModel(ctx,null,{id:'a',model:'custom/Asoft LLM Gate:model'})).rejects.toMatchObject({code:'MODEL_DISABLED_BY_USER'});expect(touches).toBe(0);
});

// Retry eligibility follows machine codes, not SDK acceptance/replaySafe: a generation that
// was interrupted after its upstream accepted the request is still worth repeating, because
// the partial output is discarded and only tokens are spent.
for (const acceptance of ['none', 'rejected', 'accepted', 'uncertain'] as const) test(`code-based retry ignores SDK acceptance ${acceptance}`, async () => {
    let writes = 0; const events: any[] = [];
    const ctx: any = { fns: {
        agent: {},
        settings: { get: async () => undefined },
        procs: { log: { warn: () => {} }, db: { transaction: ({ fn }: any) => fn(), select: async () => [{ llm_retry_attempt: 0, stopped_at: null, run_token: 'r', model: null }], run: async () => { writes++; } } },
        session: { appendEvent: async (o: any) => events.push(o.event) },
    } };
    decisionCtx(ctx);
    const f: any = { code: 'RATE_LIMITED', classification: 'throttled', retryable: true, replaySafe: false, acceptance, retryAfterMs: 17 };
    expect(await retry(ctx, null, { agentId: 'a', runToken: 'r', error: { failure: f }, signal: new AbortController().signal })).toMatchObject({ scheduled: true });
    // Retry-After is a lower bound, never a shortening: the backoff may still be longer.
    expect(writes).toBe(1); expect(events[0]).toMatchObject({ maxRetries: 5, mode: 'normal', failure: { code: 'RATE_LIMITED' } });
    expect(events[0].delayMs).toBeGreaterThanOrEqual(17);
});
test('retry never shortens Retry-After, refuses non-retryable codes and stops at the limit; lease fencing remains', async () => {
    let attempt = 0, token = 'r', writes = 0;
    const ctx: any = { fns: {
        agent: {}, settings: { get: async () => undefined }, procs: { log: { warn: () => {} }, db: {
            transaction: ({ fn }: any) => fn(), select: async () => [{ llm_retry_attempt: attempt, run_token: token, model: null }], run: async () => { writes++; },
        } }, session: { appendEvent: async () => {} },
    } };
    ctx.fns.agent.retryCodes = (o: any) => retryCodes(ctx, null, o);
    ctx.fns.agent.retryDecision = (o: any) => retryDecision(ctx, null, o);
    const f: any = { code: 'PROVIDER_ERROR', classification: 'provider', retryable: true, replaySafe: true, acceptance: 'rejected' };
    // Beyond maxDelayMs this is a parking request, not a retry: the counter is reset and
    // the caller parks the agent until that moment.
    expect(await retry(ctx, null, { agentId: 'a', runToken: 'r', error: { failure: { ...f, retryAfterMs: 60001 } }, signal: new AbortController().signal })).toMatchObject({ scheduled: false, parkUntil: expect.any(Number) });
    expect(writes).toBe(1);
    // A source that says the failure is not transient wins over an allowed code.
    expect(await retry(ctx, null, { agentId: 'a', runToken: 'r', error: { failure: { ...f, retryable: false } }, signal: new AbortController().signal })).toEqual({ scheduled: false });
    attempt = 5;
    expect(await retry(ctx, null, { agentId: 'a', runToken: 'r', error: { failure: f }, signal: new AbortController().signal })).toEqual({ scheduled: false });
    expect(writes).toBe(1);
    attempt = 0; token = 'replacement';
    await expect(retry(ctx, null, { agentId: 'a', runToken: 'r', error: { failure: f }, signal: new AbortController().signal })).rejects.toMatchObject({ name: 'AbortError' });
});
test('cancellation during durable backoff prevents retry marker and writes',async()=>{
 const ac=new AbortController();let writes=0;const ctx:any={fns:{procs:{db:{select:async()=>[{llm_retry_pending:{until:Date.now()+10000,retryId:'x'},stopped_at:null,run_token:'r'}],transaction:()=>{writes++;}}}}};
 const result=retryWait(ctx,null,{agentId:'a',runToken:'r',signal:ac.signal});setTimeout(()=>ac.abort(),5);await expect(result).rejects.toMatchObject({name:'AbortError'});expect(writes).toBe(0);
});

test('real Claude HTTP/SSE and Codex failures preserve SDK timing, redaction and replay certainty',async()=>{
 const ctx=failureCtx(),now=Date.now(),resetAt=now+120000;
 const quota=await thrown(claudeFailure(ctx,null,{conn:{} as any,status:429,body:JSON.stringify({error:{type:'usage_limit_reached',message:'SECRET',resets_at:resetAt/1000}}),h:new Headers()}));
 expect(quota.failure).toMatchObject({code:'QUOTA_EXHAUSTED',classification:'quota',resetAt,acceptance:'rejected',replaySafe:true});expect(JSON.stringify(quota)).not.toContain('SECRET');
 const overflow=await thrown(claudeFailure(ctx,null,{conn:{} as any,status:413,body:'SECRET',h:new Headers()}));expect(overflow.failure).toMatchObject({code:'OVERFLOW',classification:'invalid_input',retryable:false,replaySafe:true});
 const throttle=await thrown(claudeFailure(ctx,null,{conn:{} as any,status:429,body:'rate_limit',h:new Headers({'retry-after':'2'})}));expect(throttle.failure).toMatchObject({code:'RATE_LIMITED',retryAfterMs:2000,retryable:true});
 const sse=await thrown(claudeFailure(ctx,null,{conn:{} as any,body:JSON.stringify({error:{type:'overloaded_error'}}),h:new Headers()}));expect(sse.failure).toMatchObject({acceptance:'accepted',replaySafe:false});
 expect(codexFailure(ctx,null,{phase:'http',status:429,error:{code:'quota_exceeded',resets_at:resetAt/1000},now}).info).toMatchObject({code:'QUOTA_EXHAUSTED',resetAt});
 let scratch:any={};const parkedCtx:any={state:{agent:{}},fns:{models:{resolveRoute:async()=>({provider:'claude',accountName:'A space'})},procs:{db:{select:async({sql}:any)=>sql.startsWith('SELECT model')?[{model:'claude/A space:foo/bar:v1'}]:[{id:'a',model:'claude/A space:foo/bar:v1'}],run:async()=>({changes:1})}},session:{mutateScratchpad:async({mutate}:any)=>{mutate(scratch);return{scratchpad:scratch};},appendEvent:async()=>{}},events:{refreshAgentMeta:()=>{}},ui:{notify:async()=>{}}}};
 expect((await park(parkedCtx,null,{info:quota.failure,originAgentId:'a',now})).resetsAt).toBe(resetAt);
 for(const [fallbackMs,delay] of [[Infinity,3600000],[NaN,3600000],[-1,60000],[1e20,86400000]] as const){scratch={};expect((await park(parkedCtx,null,{info:{...quota.failure,resetAt:undefined},originAgentId:'a',now,fallbackMs})).resetsAt).toBe(now+delay);}
});
