import { describe, expect, test } from 'bun:test';
import { testCtx } from '../$test';
import start from './$start';

describe('preset management', () => {
    test('strict CRUD, duplicates and ordered reads', async () => {
        const ctx = await testCtx();
        await ctx.fns.agentPreset.ensureBuiltins({});
        await ctx.fns.agentPreset.create({ preset: { id: 'test-custom', name: 'Custom', sort_order: -10 } });
        expect((await ctx.fns.agentPreset.list({}))[0]?.id).toBe('test-custom');
        await expect(ctx.fns.agentPreset.create({ preset: { id: 'test-custom', name: 'Duplicate' } })).rejects.toThrow();
        expect((await ctx.fns.agentPreset.get({ id: 'test-custom' }))?.name).toBe('Custom');
        for (const preset of [{ id: 'Bad ID', name: 'X' }, { id: 'bad', name: '' }, { id: 'bad', name: 'X', allow: ['[bad]'] }, { id: 'bad', name: 'X', plugins: ['bad.*'] }, { id: 'bad', name: 'X', deny: [1] }, { id: 'bad', name: 'X', builtin: true }, { id: 'bad', name: 'X', sort_order: 0.5 }, { name: 'X' }]) {
            await expect(ctx.fns.agentPreset.create({ preset: preset as any })).rejects.toThrow();
        }
        for (const patch of [{ id: 'renamed' }, { updated_at: 0 }, { builtin: false }, { exclude_sections: 'bad' }, { prompt: null }, { allow: undefined }]) {
            await expect(ctx.fns.agentPreset.update({ id: 'test-custom', patch: patch as any })).rejects.toThrow();
        }
        const updated = await ctx.fns.agentPreset.update({ id: 'test-custom', patch: { plugins: ['absent-plugin'], allow: ['files.*'], prompt: 'Addition' } });
        expect(updated.plugins).toEqual(['absent-plugin']);
        expect((await ctx.fns.agentPreset.get({ id: 'test-custom' }))?.prompt).toBe('Addition');
        expect(await ctx.fns.agentPreset.get({ id: 'missing' })).toBeNull();
        await expect(ctx.fns.agentPreset.update({ id: 'missing', patch: {} })).rejects.toThrow('missing');
        expect(await ctx.fns.agentPreset.remove({ id: 'test-custom' })).toBe(true);
        expect(await ctx.fns.agentPreset.remove({ id: 'test-custom' })).toBe(false);
    });

    test('built-in reset and protected deletion', async () => {
        const ctx = await testCtx();
        await ctx.fns.agentPreset.ensureBuiltins({});
        await ctx.fns.agentPreset.update({ id: 'standard', patch: { plugins: ['redmine'], prompt: 'edited' } });
        const reset = await ctx.fns.agentPreset.reset({ id: 'standard' });
        expect(reset.plugins).toEqual(['openspec', 'git', 'websearch', 'browser', 'gh', 'terminal', 'glab']);
        expect(reset.allow).toEqual(expect.arrayContaining(['projects.list', 'projects.get', 'planning.*', 'input.*']));
        expect(reset.allow.filter(pattern => pattern.startsWith('projects.'))).toEqual(['projects.list', 'projects.get']);
        expect(reset.prompt).toBe('');
        expect(reset.builtin).toBe(true);
        for (const id of ['standard', 'creator', 'minimal']) await expect(ctx.fns.agentPreset.remove({ id })).rejects.toThrow('built-in');
        await ctx.fns.agentPreset.create({ preset: { id: 'test-default', name: 'Default' } });
        const scoped = Object.create(ctx);
        Object.defineProperty(scoped, 'fns', { value: { ...ctx.fns, settings: { getString: async () => 'test-default' } } });
        const remove = ctx.state.registry.agentPreset.remove;
        await expect(remove(scoped, null, { id: 'test-default' })).rejects.toThrow('default');
        await expect(ctx.fns.agentPreset.reset({ id: 'test-default' })).rejects.toThrow('non-built-in');
        await ctx.fns.agentPreset.remove({ id: 'test-default' });
    });

    test('boot inserts missing rows and preserves edits', async () => {
        const ctx = await testCtx();
        await ctx.fns.agentPreset.ensureBuiltins({});
        await ctx.fns.agentPreset.update({ id: 'standard', patch: { prompt: 'keep edit' } });
        await ctx.fns.procs.db.run({ sql: "DELETE FROM agent_presets WHERE id = 'minimal'" });
        await start(ctx, null, {});
        expect((await ctx.fns.agentPreset.get({ id: 'standard' }))?.prompt).toBe('keep edit');
        expect((await ctx.fns.agentPreset.get({ id: 'minimal' }))?.builtin).toBe(true);
        const order = await ctx.fns.procs.lifecycle.order({});
        expect(order.indexOf('agentPreset')).toBeGreaterThan(order.indexOf('procs/migrate'));
        expect(order.indexOf('agentPreset')).toBeLessThan(order.indexOf('agent'));
        await ctx.fns.agentPreset.reset({ id: 'standard' });
    });

    test('default, missing default, deep snapshot independence and child narrowing', async () => {
        const ctx = await testCtx();
        await ctx.fns.agentPreset.ensureBuiltins({});
        const parent = await ctx.fns.agentPreset.resolve({});
        expect(parent.presetId).toBe('standard');
        await expect(ctx.fns.agentPreset.resolve({ id: 'missing-preset' })).rejects.toThrow('missing-preset');
        const scoped = Object.create(ctx);
        Object.defineProperty(scoped, 'fns', { value: { ...ctx.fns, settings: { getString: async () => 'missing-default' } } });
        await expect(ctx.state.registry.agentPreset.resolve(scoped, null, {})).rejects.toThrow('missing-default');
        const child = await ctx.fns.agentPreset.resolve({ id: 'creator', parent });
        expect(child.layers.map(layer => layer.id)).toEqual(['standard', 'creator']);
        expect(ctx.fns.agentPreset.allows({ snapshot: child, name: 'procs.repl.load' })).toBe(false);
        expect(ctx.fns.agentPreset.allows({ snapshot: child, name: 'tools.read' })).toBe(true);
        const inherited = await ctx.fns.agentPreset.resolve({ parent });
        expect(inherited).toEqual(parent);
        inherited.layers[0]!.allow.push('new.*');
        expect(parent.layers[0]!.allow).not.toContain('new.*');
        await ctx.fns.agentPreset.update({ id: 'standard', patch: { plugins: ['redmine'] } });
        expect(parent.layers[0]!.plugins).toEqual(['openspec', 'git', 'websearch', 'browser', 'gh', 'terminal', 'glab']);
        expect((await ctx.fns.agentPreset.resolve({})).layers[0]!.plugins).toEqual(['redmine']);
        await ctx.fns.agentPreset.reset({ id: 'standard' });
        await ctx.fns.agentPreset.create({ preset: { id: 'temporary', name: 'Temporary', allow: ['tools.read'] } });
        const kept = await ctx.fns.agentPreset.resolve({ id: 'temporary' });
        await ctx.fns.agentPreset.remove({ id: 'temporary' });
        expect(kept.layers[0]!.allow).toEqual(['tools.read']);
    });

    test('new management functions have strict runtime documentation', async () => {
        const ctx = await testCtx();
        await ctx.fns.agentPreset.ensureBuiltins({});
        for (const name of ['list', 'get', 'create', 'update', 'remove', 'reset', 'ensureBuiltins', 'resolve', 'validateDefinition']) {
            const report = await ctx.fns.runtime.docs.validate({ name: `agentPreset.${name}`, strict: true, typecheck: false });
            expect(report.ok).toBe(true);
        }
    });
});
