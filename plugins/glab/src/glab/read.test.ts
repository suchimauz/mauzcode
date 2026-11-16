import { test, expect, spyOn } from 'bun:test';
import read from './read';
const opts = { host: 'gitlab.example.com', resource: 'projects' as const };
function fake(output = '[]', code = 0) {
 return { stdout: new Response(output).body!, stderr: new Response('private diagnostic').body!, exited: Promise.resolve(code), exitCode: code, kill() {} } as any;
}
test('explicit host, GET, encoded project, no shell or inherited token', async () => {
 const spy = spyOn(Bun, 'spawn').mockReturnValue(fake());
 try {
  await read({} as any, null, { ...opts, resource: 'issues', project: 'team/sub/repo', search: 'a&b' });
  const [args, options] = spy.mock.calls[0] as any;
  expect(args).toEqual(['glab','api','projects/team%2Fsub%2Frepo/issues?per_page=25&page=1&search=a%26b','--hostname','gitlab.example.com','--method','GET']);
  expect(options.stdin).toBe('ignore'); expect(options.env.GITLAB_TOKEN).toBeUndefined();
 } finally { spy.mockRestore(); }
});
test('reject unsafe paths, host and unsupported resource before spawn', async () => {
 const spy = spyOn(Bun, 'spawn').mockReturnValue(fake());
 try {
  for (const patch of [{host:'https://evil/x'}, {host:'-evil'}, {resource:'DELETE'}, {resource:'project',project:'a/../x'}, {resource:'project',project:'a%2Fb'}, {limit:101}, {resource:'issue',project:'a',number:0}]) {
   await expect(read({} as any,null,{...opts,...patch} as any)).rejects.toThrow();
  }
  expect(spy).not.toHaveBeenCalled();
 } finally { spy.mockRestore(); }
});
test('list membership, truncation and error redaction', async () => {
 const spy = spyOn(Bun,'spawn').mockReturnValue(fake(JSON.stringify({description:'x'.repeat(5000)})));
 try {
  const r = await read({} as any,null,opts);expect(r.clipped).toBe(true);
  expect((spy.mock.calls[0] as any)[0][2]).toContain('membership=true');
  spy.mockReturnValue(fake('',1));await expect(read({} as any,null,opts)).rejects.toThrow('raw CLI errors withheld');
  spy.mockReturnValue(fake('not json'));await expect(read({} as any,null,opts)).rejects.toThrow('did not return JSON');
 } finally {spy.mockRestore();}
});
test('all fixed resources use GET and explicit pagination and identifiers', async () => {
 const endpoints: Record<string,string> = { user:'user', projects:'projects', project:'projects/42', issues:'projects/42/issues', issue:'projects/42/issues/7', mergeRequests:'projects/42/merge_requests', mergeRequest:'projects/42/merge_requests/7', pipelines:'projects/42/pipelines', pipeline:'projects/42/pipelines/7', jobs:'projects/42/jobs', job:'projects/42/jobs/7' };
 const spy = spyOn(Bun,'spawn').mockImplementation(() => fake());
 try { for (const [resource, endpoint] of Object.entries(endpoints)) {
  const result = await read({} as any,null,{...opts,resource,project:'42',number:7,page:3,limit:100} as any);
  const args = spy.mock.calls.at(-1)![0] as string[];
  expect(args[2]).toStartWith(endpoint+'?per_page=100&page=3'); expect(args.slice(-2)).toEqual(['--method','GET']); expect(result).toEqual({data:[],clipped:false,page:3,limit:100});
 }} finally { spy.mockRestore(); }
});
test('forbidden resources and malformed hostname labels never spawn', async () => {
 const spy = spyOn(Bun,'spawn').mockImplementation(() => fake());
 try {
  for (const resource of ['api','trace','artifacts','variables','files','credentials','retry','merge','__proto__']) await expect(read({} as any,null,{...opts,resource} as any)).rejects.toThrow();
  for (const host of [undefined, '', 'a..b', 'a.-b', 'a-.b', 'a:0', 'a:65536', 'a:abc', 'a:22:3', 'a/b']) await expect(read({} as any,null,{...opts,host} as any)).rejects.toThrow('hostname');
  expect(spy).not.toHaveBeenCalled();
 } finally {spy.mockRestore();}
});
test('environment host/token overrides removed while host-specific config remains', async () => {
 const keys = ['GITLAB_TOKEN','GITLAB_ACCESS_TOKEN','OAUTH_TOKEN','GITLAB_HOST','GL_HOST','GLAB_HOST','GLAB_TOKEN','GLAB_DEBUG','DEBUG','GIT_DIR','GIT_WORK_TREE'];
 const previous = Object.fromEntries(keys.map(key => [key,process.env[key]]));
 const spy = spyOn(Bun,'spawn').mockReturnValue(fake());
 try {
  for(const key of keys) process.env[key]='fixture-only';
  await read({} as any,null,opts);
  const options = spy.mock.calls[0]![1] as any;
  for(const key of keys) expect(options.env[key]).toBeUndefined();
  expect(options.cwd).toBe((await import('node:os')).tmpdir()); expect(options.stdin).toBe('ignore'); expect(options.env.HOME).toBe(process.env.HOME);
 } finally {spy.mockRestore(); for(const key of keys) { if(previous[key]===undefined) delete process.env[key]; else process.env[key]=previous[key]; }}
});
test('missing CLI errors are credential safe', async () => {
 const spy = spyOn(Bun,'spawn').mockImplementation(() => {throw new Error('secret-fixture-token');});
 try {await expect(read({} as any,null,opts)).rejects.toThrow('Raw CLI errors withheld');} finally {spy.mockRestore();}
});
test('30 second deadline kills stalled CLI and returns safe timeout', async () => {
 let resolveExit!: (code:number)=>void;
 const proc = {...fake(), exitCode:null, exited:new Promise<number>(resolve => {resolveExit=resolve;}), kill(){resolveExit(143);}};
 const spawn = spyOn(Bun,'spawn').mockReturnValue(proc as any);
 let deadline = 0;
 const timer = spyOn(globalThis,'setTimeout').mockImplementation(((callback:()=>void,ms:number) => {deadline=ms;queueMicrotask(callback); return 1;}) as any);
 try {await expect(read({} as any,null,opts)).rejects.toThrow('timed out after 30 seconds'); expect(deadline).toBe(30000);} finally {spawn.mockRestore();timer.mockRestore();}
});
test('reject oversized output', async () => {
 const spy = spyOn(Bun,'spawn').mockReturnValue(fake('x'.repeat(2*1024*1024+1)));
 try {await expect(read({} as any,null,opts)).rejects.toThrow('exceeded 2 MiB');} finally {spy.mockRestore();}
});
