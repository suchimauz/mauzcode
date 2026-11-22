import {expect, test, spyOn} from 'bun:test';
import {resolve} from 'node:path';
import commandLoader from './$loader_command';
import kindLoader from './$loader_commandKind';
import sectionLoader from './$loader_commandSection';
import collect from './collectDeclarations';
import validate from './validateDeclaration';
import markdown from './markdown';
import parse from './parse';
import iconKeys from '../ui/iconKeys';

const root = resolve(import.meta.dir,'../..');
const file = (name:string, value?:unknown, namespace='a/b', ext='ts') => ({name, moduleDir:namespace, rel:`${namespace}/$command_${name}.${ext}`, abs: `${root}/test/fixtures/command-declarations/$command_${name}.${ext}`, ...(value === undefined ? {} : {mod:{default:value}})});
const prompt = {kind:'prompt', label:'Name', description:'Description', template:'Body'};
const kind = file('prompt',{validate() {},describe() {return {}}});
function setup() {
    const ctx:any = {state:{}, fns:{commands:{},ui:{iconKeys},procs:{project:{projectRoot:()=>root}}}};
    ctx.fns.commands.collectDeclarations = (o:any) => collect(ctx,null,o);
    ctx.fns.commands.validateDeclaration = (o:any) => validate(ctx,null,o);
    ctx.fns.commands.markdown = (o:any) => markdown(ctx,null,o);
    return ctx;
}

test('one bad file does not break healthy declarations, pending commands activate; doc example loads verbatim', async () => {
    const ctx = setup();
    const warnings = spyOn(console,'warn').mockImplementation(()=>{});
    try {
        const example = file('summary',undefined,'reviews','md');
        const doc = await Bun.file(resolve(root,'docs/runtime-authoring.md')).text();
        expect(doc).toContain('```markdown\n'+await Bun.file(example.abs).text()+'```');
        const fromJSON = file('alpha',undefined,'a/b','json');
        const invalid = file('missing',{kind:'prompt', label:'Only label'});
        const strange = file('custom',{...prompt,kind:'notRegistered'});
        const icon = file('unknownIcon',{...prompt,icon:'wrong'});
        await commandLoader(ctx,null,{entries:[example,fromJSON,invalid,strange,icon]});
        expect(Object.keys(ctx.state.commands.registry)).toEqual([]);
        await kindLoader(ctx,null,{entries:[kind]});
        expect(Object.keys(ctx.state.commands.registry)).toEqual(['reviews:summary','a.b:alpha','a.b:unknownIcon']);
        expect(ctx.state.commands.registry['reviews:summary'].template).toContain('Summarize these changes: {{args}}');
        expect(ctx.state.commands.registry['a.b:unknownIcon'].icon).toBe('wrench');
        for (const entry of [invalid,strange,icon]) expect(warnings.mock.calls.flat().join('\n')).toContain(entry.rel);
        warnings.mockClear();
        const duplicate={...file('alpha',{...prompt,label:'Duplicate'}),abs:'/another/$command_alpha.ts'};
        await commandLoader(ctx,null,{entries:[duplicate]});
        expect(ctx.state.commands.registry['a.b:alpha'].label).toBe('Alpha');
        expect(warnings.mock.calls.flat().join('\n')).toContain('duplicate command');
        await commandLoader(ctx,null,{entries:[{...duplicate,removed:true}]});
        warnings.mockClear();
        await commandLoader(ctx,null,{entries:[example]});
        expect(warnings.mock.calls.flat().join('\n')).not.toContain('duplicate command');
    } finally {warnings.mockRestore();}
});

test('option limits, non-core builtins and reserved namespaces are rejected independently', async () => {
    const ctx = setup();
    await kindLoader(ctx,null,{entries:[kind]});
    const checked = (declaration:unknown, namespace='a') => validate(ctx,null,{shortName:'run', namespace,source:'test',declaration});
    const options = Array.from({length:100},()=>({value:'x'.repeat(200)}));
    expect((await checked({...prompt,args:{options}})).name).toBe('a:run');
    for (const args of [{options:[...options,...options]},{options:[{value:'ok',label:'x'.repeat(201)}]},{options:[{value:''}]}]) await expect(checked({...prompt,args})).rejects.toThrow('argument options');
    for (const ns of ['project','user','user.sub']) await expect(checked(prompt,ns)).rejects.toThrow('reserved');
    await expect(checked({...prompt,builtin:true})).rejects.toThrow('builtin');
});

test('file deletion and full mount replacement remove commands, sections and dependent kinds; re-enabling restores them', async () => {
    const ctx = setup();
    const run = file('Run-One',prompt);
    const section = file('examples',{label:'Examples'});
    const external = {...file('dependent',prompt,'another'),mod:{default:prompt,sections:[{id:'extra',label:'Extra'}]}};
    const load = async () => {
        await kindLoader(ctx,null,{entries:[kind],full:true});
        await sectionLoader(ctx,null,{entries:[section],full:true});
        await commandLoader(ctx,null,{entries:[run,external],full:true});
    };
    const read = (text:string) => parse(ctx,null,{text});
    await load();
    expect(await read('/a.b:Run-One hello')).toEqual({name:'a.b:Run-One',args:'hello'});
    for (const text of ['/file.txt','/home/user/file.txt']) expect(await read(text)).toBeNull();
    await expect(read('/nope:thing')).rejects.toMatchObject({code:'unknown_command'});
    await commandLoader(ctx,null,{entries:[{...run,removed:true}]});
    await expect(read('/a.b:Run-One')).rejects.toMatchObject({code:'unknown_command'});
    await load();
    expect(Object.keys(ctx.state.commands.sections).sort()).toEqual(['examples','extra']);
    await commandLoader(ctx,null,{entries:[external],full:true});
    await sectionLoader(ctx,null,{entries:[],full:true});
    await kindLoader(ctx,null,{entries:[],full:true});
    expect(Object.keys(ctx.state.commands.sections)).toEqual(['extra']);
    expect(ctx.state.commands.kinds.prompt).toBeUndefined();
    await expect(read('/a.b:Run-One')).rejects.toThrow('Unknown command');
    await expect(read('/another:dependent')).rejects.toThrow('Unknown command');
    await load();
    expect(await read('/another:dependent')).toEqual({name:'another:dependent',args:''});
});
