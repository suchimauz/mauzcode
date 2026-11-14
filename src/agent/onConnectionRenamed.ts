/**
 * Rewrite agent-owned model routes after a connection account rename
 *
 * Subscribe from agent startup to models.connectionRenamed. Atomically rewrites exact provider/account prefixes in agents and kv.last-model, preserving native model separators. Repeated delivery and no-op renames do not write or emit changes; live agents refresh only after commit.
 * @param opts.provider Registered provider identifier from the rename event.
 * @param opts.from Previous account name, preserved literally including spaces.
 * @param opts.to New validated account name.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Registered provider identifier from the rename event. */
        provider: string;
        /** Previous account name, preserved literally including spaces. */
        from: string;
        /** New validated account name. */
        to: string;
    },
): Promise<{ agents: string[]; lastModel: boolean }> {
    if (opts.from === opts.to) return { agents: [], lastModel: false };
    if (!opts.provider || /[/:]/.test(opts.provider) || !opts.from.trim() || !opts.to.trim() || /[/:]/.test(opts.from + opts.to)) throw new Error('Invalid connection rename');
    const prefix = `${opts.provider}/${opts.from}:`, next = `${opts.provider}/${opts.to}:`;
    // Postgres string offsets count Unicode code points, not UTF-16 code units.
    const prefixLength = Array.from(prefix).length;
    const result = await ctx.fns.procs.db.transaction({ fn: async () => {
     const rows = await ctx.fns.procs.db.select({ sql: 'UPDATE agents SET model = ? || substring(model from ?), updated_at = ? WHERE left(model, ?) = ? RETURNING id, model', params: [next, prefixLength + 1, Date.now(), prefixLength, prefix] }) as {id: string; model: string}[];
     const kv = await ctx.fns.procs.db.run({ sql: "UPDATE kv SET value = ? || substring(value from ?) WHERE key = 'last-model' AND left(value, ?) = ?", params: [next, prefixLength + 1, prefixLength, prefix] });
     return { rows, lastModel: kv.changes > 0 };
    } }) as { rows: {id: string; model: string}[]; lastModel: boolean };
    for (const row of result.rows) { const live = ctx.state.agent[row.id]; if (live) live.model = row.model; }
    if (result.rows.length || result.lastModel) ctx.fns.events.emitAgentsChanged({ reason: 'connection-renamed' });
    return { agents: result.rows.map(row => row.id), lastModel: result.lastModel };
}
