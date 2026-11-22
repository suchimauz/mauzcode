import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import load from './workspaceCommands';
import markdown from './markdown';
import validate from './validateDeclaration';
import prompt from './$commandKind_prompt';
import client from './$commandKind_client';
import quote from '../remote/quote';
import reload from '../plugins/reload';

const doc = (body = 'Write {{args}}', fields = '') => `---\nlabel: Notes\ndescription: Release notes\n${fields}---\n${body}`;
async function withFixture(run: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
    const f = await fixture();
    try { await run(f); } finally { await rm(f.root, {recursive:true, force:true}); }
}
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'command-files-'));
    const project = join(root, '.mauzcode', 'commands');
    const user = join(root, 'personal', 'commands');
    await Promise.all([project,user].map(p => mkdir(p, {recursive:true})));
    const diagnostics: string[] = [];
    const ctx: any = {env:{USER_PLUGINS:join(root, 'personal')}, state:{commands:{kinds:{prompt,client}}}, fns:{
        procs:{log:{warn:({source, msg}:any) => diagnostics.push(`${source}: ${msg}`)}, project:{workdir:() => root}, modules:{reload:async () => []}},
        ui:{iconKeys:() => ['wrench']}, commands:{}, remote:{quote:(opts:any) => quote(ctx,null,opts)},
    }};
    ctx.fns.commands.markdown = (opts:any) => markdown(ctx,null,opts);
    ctx.fns.commands.validateDeclaration = (opts:any) => validate(ctx,null,opts);
    ctx.fns.commands.workspaceCommands = (opts:any) => load(ctx,null,opts);
    const list = (host = '') => load(ctx,null,{agent:{workspaceDir:root, workspaceHost:host}});
    return {ctx,root,project,user,list,diagnostics};
}
test('Markdown commands have source namespaces; only safe kinds and fields become visible', () => withFixture(async f => {
    await Promise.all([
        writeFile(join(f.project,'release-notes.md'), doc()),
        writeFile(join(f.project,'huge.md'), doc('x'.repeat(32768))),
        writeFile(join(f.project,'action.md'), doc('', 'kind: action\nfn: plugins.reload\n')),
        writeFile(join(f.project,'available.md'), doc('x', 'available: plugins.reload\n')),
        writeFile(join(f.project,'client.md'), doc('', 'kind: client\nclientAction: open-goal\n')),
        writeFile(join(f.user,'goal.md'), doc('', 'kind: client\nclientAction: open-goal\n')),
        writeFile(join(f.user,'action.md'), doc('', 'kind: action\nfn: plugins.reload\n')),
        symlink(join(f.user, 'goal.md'), join(f.project, 'link.md')),
    ]);
    expect((await f.list()).map(c => [c.name,c.kind])).toEqual([['user:goal','client'],['project:release-notes','prompt']]);
    expect((await load(f.ctx,null,{})).map(c => c.name)).toEqual(['user:goal']);
    for (const file of ['huge.md','action.md','available.md','client.md']) expect(f.diagnostics.join('\n')).toContain(join(f.project,file));
    expect(f.diagnostics.join('\n')).toContain(join(f.user,'action.md'));
}));
test('file metadata invalidates cached templates after TTL even if directory is unchanged', () => withFixture(async f => {
    const file = join(f.project,'release-notes.md');
    await writeFile(file, doc('first'));
    expect((await f.list())[0]!.template).toBe('first');
    await writeFile(file, doc('other'));
    await utimes(file, new Date(), new Date(Date.now()+2000));
    expect((await f.list())[0]!.template).toBe('first');
    for (const cached of f.ctx.state.commands.fileCache.values()) cached.checked -= 5001;
    expect((await f.list())[0]!.template).toBe('other');
}));
test('the file-count limit skips excess files with a source diagnostic', () => withFixture(async f => {
    await Promise.all(Array.from({length:53},(_,i) => writeFile(join(f.project,`cmd${i}.md`),doc())));
    expect(await f.list()).toHaveLength(50);
    expect(f.diagnostics.join('\n')).toMatch(/cmd\d+\.md: Only 50/);
}));
test('reads SSH project using only its host, bounded commands, and quoted workspace path', () => withFixture(async f => {
    const workspace = join(f.root,"remote's dir");
    const dir = join(workspace,'.mauzcode','commands');
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,'notes.md'),doc('remote only'));
    let calls = 0;
    f.ctx.fns.remote.exec = async ({host,command,maxOutput,timeout}:any) => {
        expect(host).toBe('lab'); expect(maxOutput).toBeLessThanOrEqual(65536); expect(timeout).toBeGreaterThan(0); calls++;
        const p = Bun.spawn(['bash','-c',command],{stdout:'pipe',stderr:'pipe'});
        return {stdout:await new Response(p.stdout).text(),exitCode:await p.exited};
    };
    const read = () => load(f.ctx,null,{agent:{workspaceDir:workspace,workspaceHost:'lab'}});
    expect(await read()).toMatchObject([{name:'project:notes',template:'remote only'}]);
    expect(await read()).toHaveLength(1); expect(calls).toBe(2);
}));
test('plugin reload refreshes user files immediately, without requiring an agent', () => withFixture(async f => {
    const file = join(f.user,'notes.md'); await writeFile(file,doc('before'));
    expect((await load(f.ctx,null,{}))[0]!.template).toBe('before');
    await writeFile(file,doc('after')); await reload(f.ctx,null,{});
    expect((await load(f.ctx,null,{}))[0]!.template).toBe('after');
}));
