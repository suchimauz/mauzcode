import { describe, expect, test } from 'bun:test';
import { mkModelsTestCtx as mkTestCtx } from './modelsTestCtx.entry';

async function connection(ctx: any, id: string, provider: string, accountName: string, createdAt: number) {
    await ctx.fns.procs.db.run({
        sql: "INSERT INTO llm_connections(id,provider,account_name,config,secrets,transport,enabled,created_at,updated_at) VALUES (?,?,?,'{}'::jsonb,'{}'::jsonb,'{\"kind\":\"direct\"}'::jsonb,true,?,?)",
        params: [id, provider, accountName, createdAt, createdAt],
    });
}

async function agentWith(ctx: any, model: string, archived = false) {
    const agent = await ctx.fns.agent.start({ model: 'mock/default:test' });
    await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET model = ?, archived_at = ? WHERE id = ?', params: [model, archived ? Date.now() : null, agent.id] });
    agent.model = model;
    return agent;
}

// Through the loaded registry, not a cross-file import.
const migrationOf = (ctx: any) => ctx.state.procs.migrate.list.find((m: any) => m.id === '20370405120000_model_routes');
const modelOf = async (ctx: any, id: string) =>
    (await ctx.fns.procs.db.select({ sql: 'SELECT model FROM agents WHERE id = ?', params: [id] }))[0].model;
const lastModel = async (ctx: any) =>
    (await ctx.fns.procs.db.select({ sql: "SELECT value FROM kv WHERE key = 'last-model'", params: [] }))[0]?.value;

describe('model routes migration', () => {
    test('maps legacy routes, clears archived models irreversibly and restores only backed-up rows', async () => {
        const ctx: any = await mkTestCtx();
        const migration = migrationOf(ctx);
        // Newer claude first by id but older by createdAt: createdAt decides.
        await connection(ctx, '00000000-0000-4000-8000-00000000000b', 'claude', 'work', 100);
        await connection(ctx, '00000000-0000-4000-8000-00000000000a', 'claude', 'late', 200);
        await connection(ctx, '00000000-0000-4000-8000-00000000000c', 'codex', 'first', 100);
        await connection(ctx, '00000000-0000-4000-8000-00000000000d', 'codex', 'me', 300);
        const cc = await agentWith(ctx, 'claude-code/default:claude-opus-4:1m');
        const anth = await agentWith(ctx, 'ssh/box:anthropic-oauth/x:claude-sonnet-4');
        const codexSame = await agentWith(ctx, 'codex/me:gpt-5');
        const codexOther = await agentWith(ctx, 'codex/zzz:gpt-5');
        const other = await agentWith(ctx, 'openrouter/default:qwen');
        const current = await agentWith(ctx, 'claude/work:claude-opus-4');
        const archived = await agentWith(ctx, 'codex/me:gpt-5', true);
        const archivedWeird = await agentWith(ctx, 'garbage', true);
        await ctx.fns.procs.db.run({ sql: "INSERT INTO kv (key, value) VALUES ('last-model', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", params: ['anthropic/default:claude-haiku'] });

        await migration.up(ctx);

        expect(await modelOf(ctx, cc.id)).toBe('claude/work:claude-opus-4:1m');
        expect(await modelOf(ctx, anth.id)).toBe('claude/work:claude-sonnet-4');
        expect(await modelOf(ctx, codexSame.id)).toBe('codex/me:gpt-5');
        expect(await modelOf(ctx, codexOther.id)).toBe('codex/first:gpt-5');
        expect(await modelOf(ctx, other.id)).toBe('openrouter/default:qwen');
        expect(await modelOf(ctx, current.id)).toBe('claude/work:claude-opus-4');
        expect(await modelOf(ctx, archived.id)).toBeNull();
        expect(await modelOf(ctx, archivedWeird.id)).toBeNull();
        expect(ctx.state.agent[cc.id].model).toBe('claude/work:claude-opus-4:1m');
        expect(ctx.state.agent[archived.id].model).toBeNull();
        expect(await lastModel(ctx)).toBe('claude/work:claude-haiku');
        const backup = await ctx.fns.procs.db.select({ sql: 'SELECT agent_id, old_model FROM agent_model_routes_backup ORDER BY agent_id', params: [] });
        expect(backup.map((r: any) => r.agent_id).sort()).toEqual([anth.id, cc.id, codexOther.id, 'kv:last-model'].sort());

        // Repeated up keeps the original backup and is otherwise a no-op.
        await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET model = ? WHERE id = ?', params: ['claude-code/default:again', cc.id] });
        await migration.up(ctx);
        expect(await modelOf(ctx, cc.id)).toBe('claude/work:again');
        expect((await ctx.fns.procs.db.select({ sql: 'SELECT old_model FROM agent_model_routes_backup WHERE agent_id = ?', params: [cc.id] }))[0].old_model)
            .toBe('claude-code/default:claude-opus-4:1m');

        // down restores backups via UPDATE only; a deleted agent is not recreated, archived stays null.
        await ctx.fns.procs.db.run({ sql: 'DELETE FROM agents WHERE id = ?', params: [anth.id] });
        await migration.down(ctx);
        expect(await modelOf(ctx, cc.id)).toBe('claude-code/default:claude-opus-4:1m');
        expect(await modelOf(ctx, codexOther.id)).toBe('codex/zzz:gpt-5');
        expect(await modelOf(ctx, codexSame.id)).toBe('codex/me:gpt-5');
        expect(await modelOf(ctx, archived.id)).toBeNull();
        expect((await ctx.fns.procs.db.select({ sql: 'SELECT id FROM agents WHERE id = ?', params: [anth.id] })).length).toBe(0);
        expect(await lastModel(ctx)).toBe('anthropic/default:claude-haiku');
        expect((await ctx.fns.procs.db.select({ sql: "SELECT to_regclass('agent_model_routes_backup')::text AS t", params: [] }))[0].t).toBeNull();
        await migration.down(ctx); // no backup table: no-op
        // Leave the template schema intact for the per-test reset.
        await ctx.fns.procs.db.exec({ sql: 'CREATE TABLE agent_model_routes_backup (agent_id TEXT PRIMARY KEY, old_model TEXT NOT NULL)' });
    });

    test('an agent migrated while active and archived before a repeated up stays unset after down', async () => {
        const ctx: any = await mkTestCtx();
        const migration = migrationOf(ctx);
        await connection(ctx, '00000000-0000-4000-8000-0000000000c1', 'claude', 'work', 100);
        const agent = await agentWith(ctx, 'claude-code/default:claude-opus-4');
        await migration.up(ctx);
        expect(await modelOf(ctx, agent.id)).toBe('claude/work:claude-opus-4');
        await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET archived_at = ? WHERE id = ?', params: [Date.now(), agent.id] });
        await migration.up(ctx);
        expect(await modelOf(ctx, agent.id)).toBeNull();
        expect(ctx.state.agent[agent.id].model).toBeNull();
        expect((await ctx.fns.procs.db.select({ sql: 'SELECT 1 FROM agent_model_routes_backup WHERE agent_id = ?', params: [agent.id] })).length).toBe(0);
        await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET archived_at = NULL WHERE id = ?', params: [agent.id] });
        await migration.down(ctx);
        expect(await modelOf(ctx, agent.id)).toBeNull();
        expect(ctx.state.agent[agent.id].model).toBeNull();
        await ctx.fns.procs.db.exec({ sql: 'CREATE TABLE agent_model_routes_backup (agent_id TEXT PRIMARY KEY, old_model TEXT NOT NULL)' });
    });

    test('live agents are synchronized only for rows the migration actually updated', async () => {
        const ctx: any = await mkTestCtx();
        const migration = migrationOf(ctx);
        await connection(ctx, '00000000-0000-4000-8000-0000000000c2', 'claude', 'work', 100);
        const agent = await agentWith(ctx, 'claude-code/default:x');
        // The live object diverges from storage: only the stored row is authoritative.
        agent.model = 'mock/default:test';
        const unchanged = await agentWith(ctx, 'openrouter/default:qwen');
        unchanged.model = 'mock/default:live';
        await migration.up(ctx);
        expect(ctx.state.agent[agent.id].model).toBe('claude/work:x');
        expect(ctx.state.agent[unchanged.id].model).toBe('mock/default:live');
    });

    test('runs after the unique connection identity migration', async () => {
        const ctx: any = await mkTestCtx();
        const ids = ctx.state.procs.migrate.list.map((m: any) => m.id).sort();
        const unique = ids.findIndex((id: string) => id === '20370403120000_unique_connection_identity');
        const routes = ids.findIndex((id: string) => id === '20370405120000_model_routes');
        expect(unique).toBeGreaterThanOrEqual(0);
        expect(routes).toBeGreaterThan(unique);
    });

    test('synthetic production snapshot: 11 ssh codex, 3 ssh claude-code and kv map exactly; down restores originals only', async () => {
        const ctx: any = await mkTestCtx();
        const migration = migrationOf(ctx);
        await connection(ctx, '00000000-0000-4000-8000-0000000000e1', 'codex', 'su4imauz', 100);
        await connection(ctx, '00000000-0000-4000-8000-0000000000e2', 'claude', '2yfl55fsh', 100);
        const codexModels = ['gpt-5', 'gpt-5-codex', 'gpt-5.1', 'gpt-5.1-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex-mini', 'gpt-5.2', 'gpt-5.2-codex', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.5'];
        const codex = [] as Array<{ id: string; original: string; expected: string }>;
        for (const [i, model] of codexModels.entries()) {
            const original = `ssh/host${i % 3}:codex/su4imauz:${model}`;
            codex.push({ id: (await agentWith(ctx, original)).id, original, expected: `codex/su4imauz:${model}` });
        }
        const claudeOriginal = 'ssh/mac:claude-code/brailyndaishaun14091998:claude-opus-5-5';
        const claude = [] as string[];
        for (let i = 0; i < 3; i++) claude.push((await agentWith(ctx, claudeOriginal)).id);
        const archivedCodex = await agentWith(ctx, 'ssh/host0:codex/su4imauz:gpt-5', true);
        const archivedClaude = await agentWith(ctx, claudeOriginal, true);
        await ctx.fns.procs.db.run({ sql: "INSERT INTO kv (key, value) VALUES ('last-model', ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", params: [claudeOriginal] });

        await migration.up(ctx);

        const rows = await ctx.fns.procs.db.select({ sql: 'SELECT id, model, archived_at FROM agents', params: [] }) as any[];
        const active = rows.filter(r => r.archived_at == null);
        expect(active.filter(r => r.model?.startsWith('codex/su4imauz:')).length).toBe(11);
        expect(active.filter(r => r.model === 'claude/2yfl55fsh:claude-opus-5-5').length).toBe(3);
        expect(active.length).toBe(14);
        for (const c of codex) expect(await modelOf(ctx, c.id)).toBe(c.expected);
        for (const id of claude) expect(await modelOf(ctx, id)).toBe('claude/2yfl55fsh:claude-opus-5-5');
        expect(await lastModel(ctx)).toBe('claude/2yfl55fsh:claude-opus-5-5');
        expect(await modelOf(ctx, archivedCodex.id)).toBeNull();
        expect(await modelOf(ctx, archivedClaude.id)).toBeNull();
        const backup = await ctx.fns.procs.db.select({ sql: 'SELECT agent_id FROM agent_model_routes_backup', params: [] }) as any[];
        expect(backup.length).toBe(15);
        expect(backup.some((b: any) => b.agent_id === archivedCodex.id || b.agent_id === archivedClaude.id)).toBe(false);

        await migration.down(ctx);
        for (const c of codex) expect(await modelOf(ctx, c.id)).toBe(c.original);
        for (const id of claude) expect(await modelOf(ctx, id)).toBe(claudeOriginal);
        expect(await lastModel(ctx)).toBe(claudeOriginal);
        expect(await modelOf(ctx, archivedCodex.id)).toBeNull();
        expect(await modelOf(ctx, archivedClaude.id)).toBeNull();
        await ctx.fns.procs.db.exec({ sql: 'CREATE TABLE agent_model_routes_backup (agent_id TEXT PRIMARY KEY, old_model TEXT NOT NULL)' });
    });

    test('equal createdAt ties pick the lowest connection id', async () => {
        const ctx: any = await mkTestCtx();
        const migration = migrationOf(ctx);
        await connection(ctx, '00000000-0000-4000-8000-0000000000f2', 'claude', 'second', 500);
        await connection(ctx, '00000000-0000-4000-8000-0000000000f1', 'claude', 'first', 500);
        await connection(ctx, '00000000-0000-4000-8000-0000000000f4', 'codex', 'later', 500);
        await connection(ctx, '00000000-0000-4000-8000-0000000000f3', 'codex', 'earlier', 500);
        const claude = await agentWith(ctx, 'claude-code/default:claude-opus-5-5');
        const codex = await agentWith(ctx, 'codex/missing:gpt-5');
        await migration.up(ctx);
        expect(await modelOf(ctx, claude.id)).toBe('claude/first:claude-opus-5-5');
        expect(await modelOf(ctx, codex.id)).toBe('codex/earlier:gpt-5');
    });

    test('Unicode account names match exactly and native model ids keep / and : verbatim', async () => {
        const ctx: any = await mkTestCtx();
        const migration = migrationOf(ctx);
        await connection(ctx, '00000000-0000-4000-8000-0000000000a1', 'codex', 'первый', 100);
        await connection(ctx, '00000000-0000-4000-8000-0000000000a2', 'codex', 'рабочий-ü', 200);
        await connection(ctx, '00000000-0000-4000-8000-0000000000a3', 'claude', 'дом', 100);
        const codex = await agentWith(ctx, 'ssh/box:codex/рабочий-ü:vendor/gpt-5:thinking');
        const claude = await agentWith(ctx, 'anthropic-oauth/x:anthropic/claude:opus/1m');
        await migration.up(ctx);
        expect(await modelOf(ctx, codex.id)).toBe('codex/рабочий-ü:vendor/gpt-5:thinking');
        expect(await modelOf(ctx, claude.id)).toBe('claude/дом:anthropic/claude:opus/1m');
        await migration.down(ctx);
        expect(await modelOf(ctx, codex.id)).toBe('ssh/box:codex/рабочий-ü:vendor/gpt-5:thinking');
        expect(await modelOf(ctx, claude.id)).toBe('anthropic-oauth/x:anthropic/claude:opus/1m');
        await ctx.fns.procs.db.exec({ sql: 'CREATE TABLE agent_model_routes_backup (agent_id TEXT PRIMARY KEY, old_model TEXT NOT NULL)' });
    });

    test('a missing kv last-model is not created by up, and a kv deleted after up is not recreated by down', async () => {
        const ctx: any = await mkTestCtx();
        const migration = migrationOf(ctx);
        await connection(ctx, '00000000-0000-4000-8000-0000000000b1', 'claude', 'work', 100);
        await ctx.fns.procs.db.run({ sql: "DELETE FROM kv WHERE key = 'last-model'", params: [] });
        await migration.up(ctx);
        expect(await lastModel(ctx)).toBeUndefined();
        expect((await ctx.fns.procs.db.select({ sql: "SELECT 1 FROM agent_model_routes_backup WHERE agent_id = 'kv:last-model'", params: [] })).length).toBe(0);
        await migration.down(ctx);
        expect(await lastModel(ctx)).toBeUndefined();

        await ctx.fns.procs.db.exec({ sql: 'CREATE TABLE IF NOT EXISTS agent_model_routes_backup (agent_id TEXT PRIMARY KEY, old_model TEXT NOT NULL)' });
        await ctx.fns.procs.db.run({ sql: "INSERT INTO kv (key, value) VALUES ('last-model', 'claude-code/default:x')", params: [] });
        await migration.up(ctx);
        expect(await lastModel(ctx)).toBe('claude/work:x');
        await ctx.fns.procs.db.run({ sql: "DELETE FROM kv WHERE key = 'last-model'", params: [] });
        await migration.down(ctx);
        expect(await lastModel(ctx)).toBeUndefined();
        await ctx.fns.procs.db.exec({ sql: 'CREATE TABLE agent_model_routes_backup (agent_id TEXT PRIMARY KEY, old_model TEXT NOT NULL)' });
    });

    test('without target connections every route is kept unchanged', async () => {
        const ctx: any = await mkTestCtx();
        const migration = migrationOf(ctx);
        const cc = await agentWith(ctx, 'claude-code/default:claude-opus-4');
        const codex = await agentWith(ctx, 'codex/me:gpt-5');
        await migration.up(ctx);
        expect(await modelOf(ctx, cc.id)).toBe('claude-code/default:claude-opus-4');
        expect(await modelOf(ctx, codex.id)).toBe('codex/me:gpt-5');
    });
});

describe('agent without a selected model', () => {
    test('requireModel returns a route or throws a non-retryable MODEL_NOT_SELECTED failure', async () => {
        const ctx: any = await mkTestCtx();
        expect(ctx.fns.agent.requireModel({ model: 'mock/default:test' })).toBe('mock/default:test');
        for (const model of [null, undefined, '', '  ']) {
            let error: any;
            try { ctx.fns.agent.requireModel({ model, agentId: 'zz' }); } catch (e) { error = e; }
            expect(error?.code).toBe('MODEL_NOT_SELECTED');
            expect(error?.failure).toMatchObject({ code: 'MODEL_NOT_SELECTED', retryable: false, acceptance: 'none' });
            expect(String(error?.message)).toContain('choose a model');
        }
    });

    test('run fails before any provider request and model-dependent helpers fail closed', async () => {
        const ctx: any = await mkTestCtx();
        ctx.fns.agent.syncPlanningContext = async () => {};
        let streamed = 0;
        const stream = ctx.state.registry.models.stream;
        ctx.state.registry.models.stream = async (...args: any[]) => { streamed++; return stream(...args); };
        const agent = await ctx.fns.agent.start({ model: 'mock/default:test' });
        await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET model = NULL WHERE id = ?', params: [agent.id] });
        agent.model = null;

        await expect(ctx.fns.agent.run({ agent, userText: 'go' })).rejects.toMatchObject({ code: 'MODEL_NOT_SELECTED' });
        expect(streamed).toBe(0);
        expect(agent.activeRunCount ?? 0).toBe(0);
        expect(await ctx.fns.agent.autoCompactIfNeeded({ agent })).toMatchObject({ status: 'not_needed' });
        await expect(ctx.fns.agent.compactContext({ agent })).rejects.toMatchObject({ code: 'MODEL_NOT_SELECTED' });
        await expect(ctx.fns.agent.contextBudget({ agentId: agent.id })).rejects.toMatchObject({ code: 'MODEL_NOT_SELECTED' });
        expect(await ctx.fns.goal.nativeCapability({ agentId: agent.id })).toMatchObject({ available: false, reason: 'model_not_selected' });

        // Selecting a model again is the explicit recovery path.
        await ctx.fns.agent.setModel({ id: agent.id, model: 'mock/default:test' });
        expect(agent.model).toBe('mock/default:test');
    });
});

describe('restored archived agent end to end', () => {
    async function drain(ctx: any, agentId: string) {
        const loop = ctx.fns.agent.workerLoop({});
        const t0 = Date.now();
        while (Date.now() - t0 < 10000) {
            const row = (await ctx.fns.procs.db.select({ sql: 'SELECT run_state, next_run_at FROM agents WHERE id = ?', params: [agentId] }))[0];
            if (row.run_state !== 'running' && row.next_run_at == null) break;
            await Bun.sleep(20);
        }
        ctx.state.workerLoopRunning = false;
        ctx.fns.agent.wakeWorker({});
        await loop;
    }

    test('restore → unset model → worker run fails MODEL_NOT_SELECTED without provider or retry → explicit selection → successful run', async () => {
        const ctx: any = await mkTestCtx();
        ctx.fns.agent.syncPlanningContext = async () => {};
        let streamed = 0;
        const stream = ctx.state.registry.models.stream;
        ctx.state.registry.models.stream = async (...args: any[]) => { streamed++; return stream(...args); };
        const migration = ctx.state.procs.migrate.list.find((m: any) => m.id === '20370405120000_model_routes');
        // An archived codex route that was already resolvable is still cleared.
        await connection(ctx, '00000000-0000-4000-8000-0000000000c3', 'codex', 'me', 100);
        const agent = await agentWith(ctx, 'codex/me:gpt-5', true);
        await migration.up(ctx);
        expect(await modelOf(ctx, agent.id)).toBeNull();

        expect(await ctx.fns.session.unarchive({ id: agent.id })).toEqual({ ok: true });
        const loaded = await ctx.fns.session.load({ id: agent.id });
        expect(loaded.model).toBeNull();
        // Read model for the existing picker: shown as unset, never filled from a default.
        const view = await ctx.state.registry.frontendBridge.modelData(ctx, { user: { id: 'u' } }, { agentId: agent.id });
        expect(view.model).toBe('');

        await ctx.fns.session.appendUserMessage({ id: agent.id, text: 'hello' });
        await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET next_run_at = ? WHERE id = ?', params: [Date.now(), agent.id] });
        await drain(ctx, agent.id);
        let row = (await ctx.fns.procs.db.select({ sql: 'SELECT model, run_state, next_run_at, last_error, last_processed_msg_idx, llm_retry_pending FROM agents WHERE id = ?', params: [agent.id] }))[0];
        expect(streamed).toBe(0);
        expect(row).toMatchObject({ model: null, run_state: 'idle', next_run_at: null, llm_retry_pending: null });
        expect(String(row.last_error)).toContain('no model selected');
        expect(Number(row.last_processed_msg_idx)).toBe(-1);

        await ctx.fns.agent.setModel({ id: agent.id, model: 'mock/default:test', scope: 'agent' });
        await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET next_run_at = ? WHERE id = ?', params: [Date.now(), agent.id] });
        await drain(ctx, agent.id);
        row = (await ctx.fns.procs.db.select({ sql: 'SELECT model, run_state, last_error, last_processed_msg_idx FROM agents WHERE id = ?', params: [agent.id] }))[0];
        expect(streamed).toBe(1);
        expect(row).toMatchObject({ model: 'mock/default:test', run_state: 'idle', last_error: null });
        expect(Number(row.last_processed_msg_idx)).toBeGreaterThanOrEqual(0);
        const messages = await ctx.fns.session.getMessages({ id: agent.id });
        expect(messages.at(-1)).toMatchObject({ role: 'assistant' });
    });
});
