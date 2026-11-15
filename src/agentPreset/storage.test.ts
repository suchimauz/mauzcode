import { describe, expect, test } from 'bun:test';
import { testCtx } from '../$test';
import migration from './$migration_20380101120000_agent_presets';
import setting from './$setting_default';

// Real registry and isolated test Postgres, never the running application's database.
describe('agent preset storage and shipped rules', () => {
    test('migration upgrades existing agents, seeds idempotently and rolls back', async () => {
        const ctx = await testCtx();
        await migration.down(ctx);
        await ctx.fns.procs.db.run({ sql: "INSERT INTO agents (id, model, created_at, updated_at) VALUES (?, ?, 1, 1), (?, ?, 1, 1)", params: ['preset-old-a', 'mock:echo', 'preset-old-b', 'mock:echo'] });
        await migration.up(ctx);
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT id, preset_id, preset_snapshot FROM agents WHERE id LIKE 'preset-old-%' ORDER BY id" });
        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect(row.preset_id).toBe('creator');
            expect(row.preset_snapshot).toEqual({ presetId: 'creator', name: 'Creator', layers: [{ id: 'creator', allow: ['*'], deny: [], plugins: ['*'], excludeSections: [], prompt: '' }] });
        }
        expect(await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agent_presets ORDER BY sort_order' })).toEqual([{ id: 'standard' }, { id: 'creator' }, { id: 'minimal' }]);
        await ctx.fns.procs.db.run({ sql: "UPDATE agent_presets SET prompt = 'keep edit' WHERE id = 'standard'" });
        await migration.up(ctx);
        expect((await ctx.fns.procs.db.select({ sql: "SELECT prompt FROM agent_presets WHERE id = 'standard'" }))[0]?.prompt).toBe('keep edit');
        // No foreign key: deleting a preset does not remove its agent snapshot.
        await ctx.fns.procs.db.run({ sql: "DELETE FROM agent_presets WHERE id = 'creator'" });
        expect((await ctx.fns.procs.db.select({ sql: "SELECT preset_snapshot FROM agents WHERE id = 'preset-old-a'" }))[0]?.preset_snapshot).toEqual(rows[0]?.preset_snapshot);
        await migration.down(ctx);
        expect(await ctx.fns.procs.db.select({ sql: "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'agents' AND column_name IN ('preset_id', 'preset_snapshot')" })).toEqual([]);
        expect((await ctx.fns.procs.db.select({ sql: "SELECT to_regclass('agent_presets') AS table_name" }))[0]?.table_name).toBeNull();
        expect(await ctx.fns.procs.db.select({ sql: "SELECT id FROM agents WHERE id LIKE 'preset-old-%'" })).toHaveLength(2);
        await migration.up(ctx);
    });

    test('every loaded core namespace has an explicit reviewed classification', async () => {
        const ctx = await testCtx();
        const catalogue = ctx.fns.agentPreset.coreCatalogue({});
        // Local overlays can still be mounted by the test harness. Restrict the
        // loaded names to host src origins, retaining core names overridden there.
        const entries = await ctx.fns.procs.project.scan({});
        const coreRoot = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
        const core = new Set(entries.filter(e => e.rootDir === coreRoot).map(e => e.namespace.split('.')[0]!));
        const loaded = Object.keys(ctx.state.registry).filter(name => core.has(name));
        expect(loaded.filter(name => !(name in catalogue))).toEqual([]);
        for (const entry of Object.values(catalogue)) {
            expect(['standard', 'creator', 'internal']).toContain(entry.classification);
            expect(entry.patterns.length > 0).toBe(entry.classification === 'standard');
        }
        expect([...loaded, 'unclassifiedFutureCore'].filter(name => !(name in catalogue))).toEqual(['unclassifiedFutureCore']);
    });

    test('built-ins have valid row shapes and exact minimal rules', async () => {
        const ctx = await testCtx();
        const defaults = ctx.fns.agentPreset.defaults({});
        expect(defaults.map(p => p.id)).toEqual(['standard', 'creator', 'minimal']);
        for (const preset of defaults) {
            expect(preset.id).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
            expect(preset.name.length).toBeGreaterThan(0);
            expect(preset.builtin).toBe(true);
            expect(Number.isInteger(preset.sort_order)).toBe(true);
            expect(Number.isFinite(preset.updated_at)).toBe(true);
            for (const pattern of [...preset.allow, ...preset.deny]) expect(pattern).toMatch(/^[A-Za-z0-9_.*$-]+$/);
            for (const plugin of preset.plugins) expect(plugin === '*' || /^[a-z][a-z0-9-]*$/.test(plugin)).toBe(true);
            expect(preset.exclude_sections).toEqual([]);
            expect(preset.prompt).toBe('');
        }
        expect(defaults[2]?.allow).toEqual(['tools.bash', 'tools.read', 'tools.write', 'tools.edit']);
        expect(defaults[2]?.plugins).toEqual([]);
        expect(defaults[1]?.allow).toEqual(['*']);
        expect(defaults[1]?.plugins).toEqual(['*']);
        const catalogue = ctx.fns.agentPreset.coreCatalogue({});
        expect(defaults[0]?.allow).toEqual(Object.values(catalogue).filter(e => e.classification === 'standard').flatMap(e => e.patterns));
        expect(defaults[0]?.plugins).toEqual([]);
        expect(setting.default).toBe('standard');
        defaults[0]!.allow.push('unwanted.*');
        expect(ctx.fns.agentPreset.defaults({})[0]?.allow).not.toContain('unwanted.*');
    });
});
