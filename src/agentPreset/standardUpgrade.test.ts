import { describe, expect, test } from 'bun:test';
import { testCtx } from '../$test';
import migration from './$migration_20380102120000_expand_standard_capabilities';

// Historical fixture must not follow today's catalogue or defaults.
const previous = {
    id: 'standard', name: 'Standard',
    description: 'Code and task work without runtime management or plugin grants.',
    sort_order: 10, builtin: true,
    allow: [
        'agent.respondHtml', 'agent.readResult', 'agent.compact', 'agent.delegate',
        'agent.team', 'agent.ask', 'agent.steer', 'agent.finishTask',
        'agent.archiveMember', 'agent.archiveCompleted', 'agent.unarchiveMember',
        'agent.search', 'agent.message', 'agent.current', 'agent.wake', 'agent.cron',
        'agent.watch', 'agent.triggers', 'agent.cancelTrigger', 'agent.cancelAllTriggers',
        'agentPreset.list', 'agentPreset.get', 'attachments.*', 'canvas.*',
        'code.callers', 'code.slice', 'code.quality', 'code.coverage', 'code.dead',
        'code.boundary', 'files.*', 'git.*', 'goal.tool*', 'input.*', 'markdown.*',
        'planning.*', 'plugins.search', 'plugins.read', 'plugins.functions',
        'remote.servers', 'remote.status', 'resultStore.*', 'runtime.docs.search',
        'runtime.docs.get', 'secrets.list', 'session.plan', 'session.done',
        'session.updatePlan', 'session.removePlan', 'session.get*', 'session.search*',
        'settings.get', 'settings.getString', 'settings.getNumber', 'settings.list',
        'sharedAgent.list', 'sharedAgent.delegate', 'sharedAgent.result',
        'tools.read', 'tools.write', 'tools.edit', 'tools.grep', 'tools.find',
        'tools.bash', 'tools.eval', 'workspace.*',
    ],
    deny: [], plugins: [], exclude_sections: [], prompt: '', updated_at: 123,
};

async function store(ctx: Context, overrides: Partial<types.agentPreset.Preset> = {}) {
    const row = { ...previous, ...overrides };
    await ctx.fns.procs.db.run({
        sql: `INSERT INTO agent_presets
            (id, name, description, sort_order, builtin, allow, deny, plugins, exclude_sections, prompt, updated_at)
            VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
                sort_order = EXCLUDED.sort_order, builtin = EXCLUDED.builtin, allow = EXCLUDED.allow,
                deny = EXCLUDED.deny, plugins = EXCLUDED.plugins, exclude_sections = EXCLUDED.exclude_sections,
                prompt = EXCLUDED.prompt, updated_at = EXCLUDED.updated_at`,
        params: [row.id, row.name, row.description, row.sort_order, row.builtin,
            JSON.stringify(row.allow), JSON.stringify(row.deny), JSON.stringify(row.plugins),
            JSON.stringify(row.exclude_sections), row.prompt, row.updated_at],
    });
}

async function read(ctx: Context) {
    return (await ctx.fns.procs.db.select({ sql: "SELECT * FROM agent_presets WHERE id = 'standard'" }))[0];
}

describe('conservative Standard factory upgrade', () => {
    test('upgrades reordered historical rules once, preserving snapshots and other built-ins', async () => {
        const ctx = await testCtx();
        await ctx.fns.agentPreset.ensureBuiltins({});
        await store(ctx, { allow: [...previous.allow].reverse() });
        const oldSnapshot = await ctx.fns.agentPreset.resolve({ id: 'standard' });
        await ctx.fns.procs.db.run({
            sql: `INSERT INTO agents (id, model, created_at, updated_at, preset_id, preset_snapshot)
                VALUES ('standard-before-upgrade', 'mock:echo', 1, 1, 'standard', ?::jsonb)`,
            params: [JSON.stringify(oldSnapshot)],
        });
        const others = await ctx.fns.procs.db.select({ sql: "SELECT * FROM agent_presets WHERE id <> 'standard' ORDER BY id" });
        await migration.up(ctx);
        const upgraded = await read(ctx);
        const shipped = ctx.fns.agentPreset.defaults({})[0]!;
        expect({ ...upgraded, updated_at: Number(upgraded.updated_at) }).toEqual({ ...shipped, allow: expect.any(Array), updated_at: expect.any(Number) });
        expect([...upgraded.allow].sort()).toEqual([...shipped.allow].sort());
        expect(Number(upgraded.updated_at)).toBeGreaterThan(123);
        const newSnapshot = await ctx.fns.agentPreset.resolve({ id: 'standard' });
        expect(newSnapshot.layers[0]?.plugins).toEqual(shipped.plugins);
        expect(newSnapshot.layers[0]?.allow).toContain('projects.list');
        expect(oldSnapshot.layers[0]?.plugins).toEqual([]);
        expect((await ctx.fns.procs.db.select({ sql: "SELECT preset_snapshot FROM agents WHERE id = 'standard-before-upgrade'" }))[0]?.preset_snapshot).toEqual(oldSnapshot);
        expect(await ctx.fns.procs.db.select({ sql: "SELECT * FROM agent_presets WHERE id <> 'standard' ORDER BY id" })).toEqual(others);
        await migration.up(ctx);
        await ctx.fns.agentPreset.ensureBuiltins({});
        expect(await read(ctx)).toEqual(upgraded);
        await store(ctx, { ...upgraded, prompt: 'post-upgrade customization' });
        const customized = await read(ctx);
        await migration.up(ctx);
        await ctx.fns.agentPreset.ensureBuiltins({});
        expect(await read(ctx)).toEqual(customized);
    });

    test('preserves every meaningful customized field and does not recreate missing definitions', async () => {
        const ctx = await testCtx();
        const variants: Partial<types.agentPreset.Preset>[] = [
            { name: 'My Standard' }, { description: 'custom purpose' }, { sort_order: 11 },
            { builtin: false }, { allow: [...previous.allow, 'projects.*'] },
            { allow: previous.allow.slice(1) }, { deny: ['tools.bash'] },
            { plugins: ['redmine'] }, { exclude_sections: ['canvas'] }, { prompt: 'custom instructions' },
        ];
        for (const variant of variants) {
            await store(ctx, variant);
            const before = await read(ctx);
            await migration.up(ctx);
            await ctx.fns.agentPreset.ensureBuiltins({});
            expect(await read(ctx)).toEqual(before);
        }
        await ctx.fns.procs.db.run({ sql: "DELETE FROM agent_presets WHERE id = 'standard'" });
        await migration.up(ctx);
        expect(await read(ctx)).toBeUndefined();
    });

    test('historical recognition and target cannot drift when current defaults change', async () => {
        const ctx = await testCtx();
        await store(ctx);
        const defaults = ctx.state.registry.agentPreset.defaults;
        ctx.state.registry.agentPreset.defaults = (() => { throw new Error('migration must not consult current defaults'); }) as typeof defaults;
        try {
            await migration.up(ctx);
            const upgraded = await read(ctx);
            expect(upgraded.plugins).toEqual(['openspec', 'git', 'websearch', 'browser', 'gh', 'terminal', 'glab']);
            expect([...upgraded.allow].sort()).toEqual([...previous.allow, 'projects.list', 'projects.get'].sort());
        } finally {
            ctx.state.registry.agentPreset.defaults = defaults;
        }
    });
});
