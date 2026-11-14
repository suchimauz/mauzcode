import { expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

test('fresh isolated registry has no retired namespaces, declarations, routes or loaders', async () => {
    const ctx = await mkTestCtx();
    expect(new URL(ctx.env.DATABASE_URL).port).toBe('54399');
    const entries = await ctx.fns.procs.project.scan({});
    for (const name of ['llm', 'llms', 'node']) {
        expect(ctx.state.registry[name]).toBeUndefined();
        expect(ctx.fns[name]).toBeUndefined();
        expect(entries.filter((e: { moduleDir: string }) => e.moduleDir === name || e.moduleDir.startsWith(name + '/'))).toEqual([]);
    }
    expect(entries.filter((e: { abs: string }) => e.abs.includes('/legacy/'))).toEqual([]);
    const declared = await ctx.fns.settings.declared({});
    expect(declared.filter((e: { module: string }) => ['llm', 'llms', 'node'].includes(e.module))).toEqual([]);
    await ctx.fns.procs.http.loadRoutes({});
    for (const url of ['/node/v1/models', '/node/v1/usage', '/llms', '/llms/usage']) {
        expect(ctx.fns.procs.http.match({ method: 'GET', pathname: url })).toBeNull();
        const response = await ctx.fns.procs.http.dispatch({ url, headers: { Accept: 'application/json' } });
        expect(response.status).toBe(404);
    }
    expect(await ctx.fns.procs.migrate.up({})).toEqual({ applied: [] });
});

test('migrate.up retains already-applied retired history and legacy table data', async () => {
    const ctx = await mkTestCtx();
    expect(new URL(ctx.env.DATABASE_URL).port).toBe('54399');
    // A pre-upgrade snapshot marker: missing source must not delete history or data.
    const id = '20330101120000_node_tables';
    await ctx.fns.procs.db.exec({ sql: 'CREATE TABLE IF NOT EXISTS llm_nodes (name TEXT PRIMARY KEY, url TEXT NOT NULL)' });
    await ctx.fns.procs.db.run({ sql: 'INSERT INTO llm_nodes (name,url) VALUES (?,?)', params: ['retirement-marker', 'https://example.invalid'] });
    await ctx.fns.procs.db.run({ sql: 'INSERT INTO _migrations (id,applied_at) VALUES (?,?) ON CONFLICT (id) DO NOTHING', params: [id, 'historical-applied-marker'] });
    const before = await ctx.fns.procs.db.select({ sql: 'SELECT * FROM _migrations ORDER BY id' });
    expect(await ctx.fns.procs.migrate.up({})).toEqual({ applied: [] });
    expect(await ctx.fns.procs.db.select({ sql: 'SELECT * FROM _migrations ORDER BY id' })).toEqual(before);
    expect(await ctx.fns.procs.db.select({ sql: 'SELECT name,url FROM llm_nodes' })).toEqual([{ name: 'retirement-marker', url: 'https://example.invalid' }]);
});
