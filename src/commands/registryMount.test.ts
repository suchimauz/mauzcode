import {expect, test} from 'bun:test';
import {resolve} from 'node:path';
import {makeCtx} from '../$main';
import load from '../procs/boot/load';

test('mount recomposition withdraws a disabled plugin and restores all its declarations when enabled', async () => {
    // Same full boot collection invoked by procs.modules.reload, without genTypes, DB or UI effects.
    const ctx = makeCtx();
    ctx.state.root = resolve(import.meta.dir,'../..');
    ctx.env = {...ctx.env, PROCS_IGNORE_WORKSPACE:'1', PROCS_PLUGINS:'', PROCS_PATH:'/nonexistent', USER_PLUGINS:''};
    const root = resolve(import.meta.dir,'../../test/fixtures/command-registry-mount');
    for (const enabled of [true,false,true]) {
        ctx.env.USER_PLUGINS = enabled ? root : '';
        await load(ctx,null,{});
        const has = (v:unknown) => expect(!!v).toBe(enabled);
        has(ctx.state.commands.kinds?.survey);
        has(ctx.state.commands.sections?.trips);
        has(ctx.state.commands.registry?.['expeditions:go']);
        const result = ctx.fns.commands.parse({text:'/expeditions:go'});
        if (enabled) expect(await result).toEqual({name:'expeditions:go',args:''});
        else await expect(result).rejects.toMatchObject({code:'unknown_command'});
        expect(ctx.state.commands.registry?.plan).toBeDefined();
    }
}, 60_000);
