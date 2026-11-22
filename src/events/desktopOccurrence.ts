/**
 * Record and signal an eligible background chat occurrence.
 *
 * Called only after a fenced terminal run or committed open input. Retains a bounded process-local validation record; a restart invalidates prior alerts.
 * @param opts.agentId Chat receiving the occurrence.
 * @param opts.kind Authorized transition kind.
 * @param opts.token Input identifier or fenced run token.
 * @param opts.at Committed transition timestamp in milliseconds.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Chat receiving the occurrence. */
        agentId: string;
        /** Authorized transition kind. */
        kind: "run-finished" | "input-pending";
        /** Input identifier or fenced run token. */
        token: string;
        /** Committed transition timestamp in milliseconds. */
        at: number;
    },
): Promise<void> {
    const gate = opts.kind === 'input-pending' ? "EXISTS (SELECT 1 FROM inputs WHERE agent_id=a.id AND id=? AND state='open')" : "a.updated_at=? AND a.run_state='idle' AND a.run_token IS NULL AND a.next_run_at IS NULL AND a.wake_at IS NULL AND a.last_error IS NULL AND NOT EXISTS (SELECT 1 FROM inputs WHERE agent_id=a.id AND state IN ('open','processing'))";
    const [row] = await ctx.fns.procs.db.select({sql:"SELECT a.created_by FROM agents a JOIN users u ON u.id=a.created_by WHERE a.id=? AND a.archived_at IS NULL AND a.stopped_at IS NULL AND a.parent_id IS NULL AND COALESCE(a.visibility,'nav')='nav' AND u.disabled_at IS NULL AND " + gate,params:[opts.agentId,opts.kind==='input-pending'?opts.token:opts.at]});
    if (!row) return;
    const state = ((ctx.state as any).events ??= {});
    const records: Map<string,any> = state.desktopOccurrences ??= new Map();
    const id = Bun.SHA256.hash(opts.kind+':'+opts.agentId+':'+opts.token,'hex');
    if(records.has(id)) return;
    records.set(id,{...opts,owner:row.created_by,issued:new Set<string>(),expires:Date.now()+86400000});
    if(records.size>4096) records.delete(records.keys().next().value!);
    // Dedicated listeners are installed only by authenticated desktop SSE requests.
    for(const send of state.desktopListeners?.get(row.created_by) ?? []) send(id);
}
