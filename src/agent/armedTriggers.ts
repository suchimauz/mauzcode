/**
 * List an agent's armed triggers as a safe display projection
 *
 * Returns every active or checking trigger of one agent (no audit-size cap), ordered by next due/check time then ID, with per-kind counts from the same selection. Exposes only ID, kind, status, derived purpose, next time, cron expression/time zone, watch mode and timeout — never predicate configuration, SQL, URLs, function arguments or results. Authorization is the caller's responsibility.
 * @param opts.id Owning agent identifier.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owning agent identifier. */
        id: string;
    },
): Promise<{ counts: { at: number; cron: number; watch: number }; triggers: types.agent.ArmedTrigger[] }> {
    const rows = await ctx.fns.procs.db.select({ sql: `SELECT id,kind,status,prompt,timezone,mode,next_at,timeout_at,config->>'expression' AS expression
        FROM agent_triggers WHERE agent_id=? AND status IN ('active','checking') ORDER BY next_at ASC NULLS LAST,id ASC`, params: [opts.id] });
    const triggers: types.agent.ArmedTrigger[] = rows.map(row => ({
        id: String(row.id), kind: row.kind as types.agent.ArmedTrigger['kind'], status: row.status as types.agent.ArmedTrigger['status'],
        purpose: ctx.fns.agent.triggerPurpose({ prompt: String(row.prompt ?? '') }),
        nextAt: row.next_at == null ? null : Number(row.next_at),
        ...(row.kind === 'cron' ? { cronExpression: row.expression == null ? null : String(row.expression), timezone: row.timezone == null ? null : String(row.timezone) } : {}),
        ...(row.kind === 'watch' ? { mode: row.mode === 'edge' ? 'edge' as const : 'once' as const, timeoutAt: row.timeout_at == null ? null : Number(row.timeout_at) } : {}),
    }));
    const counts = { at: 0, cron: 0, watch: 0 };
    for (const trigger of triggers) if (trigger.kind in counts) counts[trigger.kind]++;
    return { counts, triggers };
}
