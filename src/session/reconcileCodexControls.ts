/** Reset obsolete consent and enqueue a single durable notice per affected chat.
 * Called inside the publishing, identity or admitting transaction with its connection locked.
 */
export default async function(ctx: Context, _session: Session|null, opts: {
    /** Connection whose row the caller has locked. */ connectionId:string;
    /** Current verified binding; null invalidates every choice. */ generation:string|null;
    /** Complete newly published or currently attested catalogue. */ models:types.models.ModelInfo[];
    /** Restrict dispatch-time repair to the admitted chat. */ agentId?:string;
}):Promise<void> {
    if (!ctx.state.procs.db?.transactionStorage?.getStore()?.active) throw new Error('Codex consent requires a transaction');
    const byId = new Map(opts.models.map(m=>[m.id,m.responseControls]));
    const rows = await ctx.fns.procs.db.select({sql:'SELECT agent_id, model_id, generation, speed, verbosity FROM codex_control_choices WHERE connection_id=?'+(opts.agentId?' AND agent_id=?':''), params:opts.agentId?[opts.connectionId,opts.agentId]:[opts.connectionId]});
    const resets = new Map<string, Set<string>>();
    for (const row of rows) {
        const controls = opts.generation && opts.generation === row.generation ? byId.get(row.model_id) : undefined;
        const speed = controls?.speed?.supported.includes(row.speed) ? row.speed : null;
        const verbosity = controls?.verbosity?.supported.includes(row.verbosity) ? row.verbosity : null;
        if (row.speed === speed && row.verbosity === verbosity) continue;
        const key = [row.agent_id,opts.connectionId,row.model_id];
        const where = ' WHERE agent_id=? AND connection_id=? AND model_id=?';
        if (speed || verbosity) await ctx.fns.procs.db.run({sql:'UPDATE codex_control_choices SET speed=?, verbosity=?'+where, params:[speed,verbosity,...key]});
        else await ctx.fns.procs.db.run({sql:'DELETE FROM codex_control_choices'+where, params:key});
        await ctx.fns.procs.db.run({sql:'UPDATE codex_control_revisions SET revision=revision+1'+where,params:key});
        const fields = resets.get(row.agent_id) ?? new Set<string>();
        if (speed !== row.speed) fields.add('speed to Standard');
        if (verbosity !== row.verbosity) fields.add('verbosity to model default');
        resets.set(row.agent_id,fields);
    }
    for (const [agentId,fields] of resets) await ctx.fns.procs.db.run({sql:'INSERT INTO codex_control_notices(id,agent_id,message,created_at) VALUES(?,?,?,?)',params:[crypto.randomUUID(),agentId,`Codex settings changed: reset ${[...fields].join(' and ')}.`,Date.now()]});
}
