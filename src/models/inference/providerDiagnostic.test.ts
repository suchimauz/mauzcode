import {expect, test} from 'bun:test';
import normalize from './providerDiagnostic';
const call = (opts: Partial<Parameters<typeof normalize>[2]>) => normalize({} as Context, null, {provider:'antigravity',stage:'http',...opts});
test('retains selected Google RPC evidence, not metadata', () => {
 const d = call({status:400, body:JSON.stringify({error:{code:400,status:'INVALID_ARGUMENT',message:'Unknown field: example',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'INVALID_FIELD',metadata:{secret:'invisible'}}]}})});
 expect(d).toMatchObject({code:'INVALID_ARGUMENT',reason:'INVALID_FIELD',message:'Unknown field: example',status:400}); expect(d.summary).toContain('HTTP 400'); expect(JSON.stringify(d)).not.toContain('invisible');
});
test('recognizes nested Responses and Anthropic stream envelopes and transport code',()=>{
 expect(call({stage:'stream',body:{response:{error:{code:'service_unavailable',message:'Try again later'}}}})).toMatchObject({code:'service_unavailable',message:'Try again later'});
 expect(call({stage:'stream',body:{type:'error',error:{type:'overloaded_error',message:'Overloaded'}}}).code).toBe('overloaded_error');
 expect(call({stage:'transport',transportCode:'ECONNRESET'}).code).toBe('ECONNRESET');
});
test('omits request fragments in both prose and upstream identifiers',()=>{
 const req={messages:[{content:'Include aubergine please'},{role:'tool',content:'result is marzipan'}]};
 for (const request of [req,JSON.stringify(req)]) { const d=call({request,body:{error:{code:'BAD_AUBERGINE',reason:'marzipan',message:'Cannot process aubergine here'}}}); expect(d.code).toBeUndefined(); expect(d.reason).toBeUndefined(); expect(d.message).toBeUndefined(); }
});
test('preserves useful provider words amid request metadata and masks personal links',()=>{
 const request={instructions:'Inspect the field type. Explain an unknown option. Check each argument.',tools:[{type:'function',description:'Show an example of a valid field',parameters:{properties:{invalid:{},argument:{}}}}],messages:[{role:'user',content:'Please help with this call'}]};
 const opts={request,status:400,body:[{error:{status:'INVALID_ARGUMENT',message:'Unknown field: example'}}]};
 expect(call(opts)).toMatchObject({code:'INVALID_ARGUMENT',message:'Unknown field: example'});
 expect(call({request,body:[{error:{message:'To continue,\n verify your account at https://private.test/secret and retry'}}]}).message).toBe('To continue, verify your account at [link removed] and retry');
 for(const scheme of ['Basic','Bearer']) expect(call({secrets:[scheme+' specialToken'],body:{error:{code:'specialToken',message:'Rejected specialToken'}}})).not.toHaveProperty('message');
});
test('distinguishes protocol fields and incidental word overlap from actual prompt or tool echoes', () => {
 const message = 'User location is not supported for the API use.';
 const body = {error:{status:'FAILED_PRECONDITION', message}};
 const request = {request:{systemInstruction:{parts:[{text:'This tool is not enabled for the current provider.'}]}, contents:[{role:'user', parts:[{text:'Reply with OK.'}]}]}};
 for (const sent of [request, JSON.stringify(request)]) expect(call({body, request:sent}).message).toBe(message);
 // The same public role word is still sensitive when it actually is all the user or tool sent.
 for (const confidential of ['user', 'user location', message]) {
  expect(call({body, request:{messages:[{role:'user',content:confidential}]}}).message).toBeUndefined();
  expect(call({body, request:{contents:[{role:'user',parts:[{functionResponse:{name:'f',response:{output:confidential}}}]}]}}).message).toBeUndefined();
 }
 // Actual short secrets still take precedence over this structural distinction.
 for (const secrets of [['user'], ['is not']]) expect(call({body, request, secrets}).message).toBeUndefined();
 expect(call({body, request:{instructions:'is not'}}).message).toBeUndefined();
 expect(call({body, request:{instructions:'The gate is not supported here.'}}).message).toBeUndefined();
 expect(call({body:{error:{code:'IS_NOT'}}, request:{instructions:'This is not enabled.'}}).code).toBeUndefined();
 expect(call({body, request:{messages:[{role:'tool',content:{role:'user'}}]}}).message).toBeUndefined();
 // A made-up role and private tool fields named role are data, not protocol enums.
 for (const sent of [{messages:[{role:'private-tag',content:'Hi'}]}, {messages:[{role:'tool',content:{role:'private-tag'}}]}]) {
  expect(call({body:{error:{message:'Invalid private-tag'}},request:sent}).message).toBeUndefined();
 }
});
test('withholds ambiguous, untrusted and unbounded evidence',()=>{
 for(const value of ['X-Trace: example','Authorization: Basic YWJj','A <script>','private value','sk-example','token rt-SECRET','rt_private','ya29.private','1//private','4/private','a\u0000b','me@example.test','x'.repeat(400)]) expect(call({body:{error:{message:value}},secrets:['private']}).message).toBeUndefined();
 for(const body of ['arbitrary plaintext','{"error":',null,' '.repeat(16385)+'{}',{debug:{message:'hidden'}}]) expect(call({body}).summary).toContain('No safe provider explanation');
 expect(call({request:'malformed',body:{message:'possibly echoed'}}).message).toBeUndefined();
 expect(call({status:999,body:{message:'Try later. '.repeat(40)}}).message?.length).toBe(300); expect(call({status:999}).status).toBeUndefined();
});
