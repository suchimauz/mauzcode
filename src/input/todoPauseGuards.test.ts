import { describe, expect, test } from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';

// Regression for the four SQL scheduling guards that read the todo pause straight from JSON.
// Each source's scheduling UPDATE is executed against isolated Postgres for a paused and a running agent.
const sources = {
    deliverInbound: '../session/deliverInbound.ts',
    submit: './submit.ts',
    choiceBatch: './choiceBatch.ts',
    complete: './complete.ts',
};
async function scheduleSql(path: string) {
    const text = await Bun.file(new URL(path, import.meta.url)).text();
    const match = text.match(/"(UPDATE agents SET [^"]*next_run_at[^"]*pausedAt[^"]*)"/);
    if (!match) throw new Error(`no scheduling guard in ${path}`);
    return match[1]!;
}

describe('todo pause blocks background scheduling', () => {
    test('every guard reads the pause from the todos key only', async () => {
        for (const path of Object.values(sources)) {
            const sql = await scheduleSql(path);
            expect(sql).toMatch(/todos/);
            expect(sql).not.toMatch(/'plan'|\{plan,/);
        }
    });

    for (const [name, path] of Object.entries(sources)) test(`${name}: a paused agent is not scheduled, a running one is`, async () => {
        const ctx: any = await mkTestCtx();
        const sql = await scheduleSql(path);
        const insert = async (id: string, pausedAt: number | null) => await ctx.fns.procs.db.run({
            sql: 'INSERT INTO agents (id, model, scratchpad, created_at, updated_at) VALUES (?, ?, ?, 1, 1)',
            params: [id, 'test', JSON.stringify({ todos: { pausedAt, tasks: [{ id: 't', status: 'active' }] }, plan: { pausedAt: null } })],
        });
        await insert('paused', 123);
        await insert('running', null);
        for (const id of ['paused', 'running']) {
            const params = name === 'deliverInbound' ? [5, true, 5, id]
                : name === 'choiceBatch' ? [5, 5, id, id]
                : [5, 5, id];
            await ctx.fns.procs.db.run({ sql, params });
        }
        const rows = await ctx.fns.procs.db.select({ sql: 'SELECT id, next_run_at FROM agents ORDER BY id' }) as any[];
        expect(Object.fromEntries(rows.map(row => [row.id, row.next_run_at == null ? null : Number(row.next_run_at)]))).toEqual({ paused: null, running: 5 });
    });
});
