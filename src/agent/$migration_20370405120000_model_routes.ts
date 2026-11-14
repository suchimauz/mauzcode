/**
 * Rewrite legacy agent model routes to model connections and clear archived selections.
 *
 * Runs after `20370403120000_unique_connection_identity`. Connections are read through
 * the `models.list` facade only. Non-archived agents and `kv.last-model` are mapped:
 * claude-code/anthropic/anthropic-oauth → first claude connection; codex → the codex
 * connection with the same account name, else the first codex connection. "First" is the
 * earliest createdAt, ties broken by id. The model id is kept verbatim. Every other route,
 * or a route without a target connection, stays unchanged and is logged.
 * Original values are backed up once in `agent_model_routes_backup` (a repeated `up` never
 * overwrites them; the last-used model uses key `kv:last-model`).
 * Every agent archived at migration time loses its model selection without backup; this is
 * intentionally irreversible, including on `down`, so `agents.model` becomes nullable.
 */
const BACKUP_KV = "kv:last-model";
const CLAUDE_SOURCES = new Set(["claude-code", "anthropic", "anthropic-oauth"]);

type Connection = { id: string; provider: string; accountName: string; createdAt: number };

/** Split `[ssh/<host>:]<provider>[/<account>]:<model>` without touching separators inside the model id. */
function parseLegacy(route: string): { provider: string; account: string; model: string } | null {
    let rest = route;
    if (rest.startsWith("ssh/")) {
        const colon = rest.indexOf(":");
        if (colon < 0) return null;
        rest = rest.slice(colon + 1);
    }
    const colon = rest.indexOf(":");
    if (colon <= 0) return null;
    const head = rest.slice(0, colon), model = rest.slice(colon + 1);
    if (!model) return null;
    const slash = head.indexOf("/");
    return slash < 0
        ? { provider: head, account: "", model }
        : { provider: head.slice(0, slash), account: head.slice(slash + 1), model };
}

function mapRoute(route: string, connections: Connection[]): { next: string | null; reason: string } {
    const parsed = parseLegacy(route);
    if (!parsed) return { next: null, reason: "unrecognized_route" };
    const first = (provider: string) => connections.filter(c => c.provider === provider)[0];
    let target: Connection | undefined;
    if (CLAUDE_SOURCES.has(parsed.provider)) target = first("claude");
    else if (parsed.provider === "codex") target = connections.find(c => c.provider === "codex" && c.accountName === parsed.account) ?? first("codex");
    else return { next: null, reason: "unsupported_provider" };
    if (!target) return { next: null, reason: "no_target_connection" };
    return { next: `${target.provider}/${target.accountName}:${parsed.model}`, reason: "mapped" };
}

async function backupExists(ctx: Context): Promise<boolean> {
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT to_regclass('agent_model_routes_backup')::text AS t", params: [] }) as Array<{ t: string | null }>;
    return rows[0]?.t != null;
}

export default {
    async up(ctx: Context) {
        const liveUpdates: Array<[string, string | null]> = [];
        await ctx.fns.procs.db.transaction({ fn: async () => {
            await ctx.fns.procs.db.exec({ sql: "CREATE TABLE IF NOT EXISTS agent_model_routes_backup (agent_id TEXT PRIMARY KEY, old_model TEXT NOT NULL)" });
            await ctx.fns.procs.db.exec({ sql: "ALTER TABLE agents ALTER COLUMN model DROP NOT NULL" });
            const connections = (await ctx.fns.models.list({}))
                .map(c => ({ id: String(c.id), provider: c.provider, accountName: c.accountName, createdAt: Number(c.createdAt) }))
                .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            const unmapped = (subject: string, model: string, reason: string) =>
                ctx.fns.procs.log.warn({ event: "agent.model-routes.unchanged", msg: `${subject} keeps ${model}: ${reason}`, subject, model, reason });

            // Row locks fence a concurrent archive/model change until commit; every UPDATE rechecks its predicate.
            const active = await ctx.fns.procs.db.select({ sql: "SELECT id, model FROM agents WHERE archived_at IS NULL AND model IS NOT NULL ORDER BY id FOR UPDATE", params: [] }) as Array<{ id: string; model: string }>;
            for (const row of active) {
                const { next, reason } = mapRoute(String(row.model), connections);
                if (!next) { unmapped(`agent ${row.id}`, row.model, reason); continue; }
                if (next === row.model) continue;
                const updated = await ctx.fns.procs.db.select({ sql: "UPDATE agents SET model = ? WHERE id = ? AND model = ? AND archived_at IS NULL RETURNING id", params: [next, row.id, row.model] }) as Array<{ id: string }>;
                if (!updated.length) continue;
                await ctx.fns.procs.db.run({ sql: "INSERT INTO agent_model_routes_backup (agent_id, old_model) VALUES (?, ?) ON CONFLICT (agent_id) DO NOTHING", params: [row.id, row.model] });
                liveUpdates.push([row.id, next]);
            }

            const last = (await ctx.fns.procs.db.select({ sql: "SELECT value FROM kv WHERE key = 'last-model' FOR UPDATE", params: [] }) as Array<{ value: string }>)[0];
            if (last?.value) {
                const { next, reason } = mapRoute(String(last.value), connections);
                if (!next) unmapped("kv last-model", last.value, reason);
                else if (next !== last.value) {
                    await ctx.fns.procs.db.run({ sql: "INSERT INTO agent_model_routes_backup (agent_id, old_model) VALUES (?, ?) ON CONFLICT (agent_id) DO NOTHING", params: [BACKUP_KV, last.value] });
                    await ctx.fns.procs.db.run({ sql: "UPDATE kv SET value = ? WHERE key = 'last-model' AND value = ?", params: [next, last.value] });
                }
            }

            // Irreversible by design: an agent archived at migration time keeps no backup row,
            // including one left by an earlier up while it was still active (the kv key is not an agent).
            await ctx.fns.procs.db.run({ sql: "DELETE FROM agent_model_routes_backup b USING agents a WHERE a.id = b.agent_id AND a.archived_at IS NOT NULL", params: [] });
            const archived = await ctx.fns.procs.db.select({ sql: "UPDATE agents SET model = NULL WHERE archived_at IS NOT NULL AND model IS NOT NULL RETURNING id", params: [] }) as Array<{ id: string }>;
            for (const row of archived) liveUpdates.push([row.id, null]);
        } });
        // Publish to loaded agents only after commit.
        for (const [id, model] of liveUpdates) { const live = (ctx.state as any)?.agent?.[id]; if (live) live.model = model; }
    },
    async down(ctx: Context) {
        if (!await backupExists(ctx)) return;
        const liveUpdates: Array<[string, string]> = [];
        await ctx.fns.procs.db.transaction({ fn: async () => {
            const rows = await ctx.fns.procs.db.select({ sql: "SELECT agent_id, old_model FROM agent_model_routes_backup ORDER BY agent_id", params: [] }) as Array<{ agent_id: string; old_model: string }>;
            for (const row of rows) {
                // UPDATE only: a deleted agent or a removed kv key is never recreated.
                if (row.agent_id === BACKUP_KV) {
                    await ctx.fns.procs.db.run({ sql: "UPDATE kv SET value = ? WHERE key = 'last-model'", params: [row.old_model] });
                    continue;
                }
                const updated = await ctx.fns.procs.db.run({ sql: "UPDATE agents SET model = ? WHERE id = ?", params: [row.old_model, row.agent_id] });
                if (updated.changes) liveUpdates.push([row.agent_id, row.old_model]);
            }
            // agents.model stays nullable: archived selections cleared by `up` are never restored.
            await ctx.fns.procs.db.exec({ sql: "DROP TABLE agent_model_routes_backup" });
        } });
        for (const [id, model] of liveUpdates) { const live = (ctx.state as any)?.agent?.[id]; if (live) live.model = model; }
    },
};
