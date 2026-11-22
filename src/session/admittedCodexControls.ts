/** Resolve consent for a server-authorized user-facing response immediately before transport handoff.
 * Never infer consent from an SDK session ID. Caller already holds this connection's admission lock.
 */
export default async function(ctx:Context, _session:Session|null, opts:{
    /** Durable chat ID from the response path. */ agentId:string;
    /** Trusted creator from the admitted chat context. */ ownerId:string|null;
    /** Locked transport connection. */ connectionId:string;
    /** Verified generation pinned to this request. */ generation:string|null;
    /** Native requested model. */ modelId:string;
}):Promise<{speed?:'fast'|'ultrafast'; verbosity?:'low'|'medium'|'high'}> {
    if (!ctx.state.procs.db?.transactionStorage?.getStore()?.active) throw new Error('Codex consent requires a transaction');
    if (!opts.ownerId) return {};
    const [conn] = await ctx.fns.procs.db.select({sql:`SELECT account_name,codex_generation,models_cache_generation,models_cache,enabled,disabled_models FROM llm_connections WHERE id=? AND provider='codex' FOR UPDATE`,params:[opts.connectionId]});
    if (!conn || conn.codex_generation !== opts.generation) return {};
    const [chat] = await ctx.fns.procs.db.select({sql:'SELECT model FROM agents WHERE id=? AND created_by=? AND archived_at IS NULL FOR SHARE',params:[opts.agentId,opts.ownerId]});
    if (chat?.model !== `codex/${conn.account_name}:${opts.modelId}`) return {};
    const models = opts.generation && conn.models_cache_generation === opts.generation && Array.isArray(conn.models_cache) ? conn.models_cache : [];
    await ctx.fns.session.reconcileCodexControls({connectionId:opts.connectionId,generation:opts.generation,models,agentId:opts.agentId});
    if (!conn.enabled || conn.disabled_models.includes(opts.modelId)) return {};
    const [choice] = await ctx.fns.procs.db.select({sql:'SELECT speed,verbosity FROM codex_control_choices WHERE agent_id=? AND connection_id=? AND model_id=? AND generation=?',params:[opts.agentId,opts.connectionId,opts.modelId,opts.generation]});
    return {...(choice?.speed ? {speed:choice.speed} : {}), ...(choice?.verbosity ? {verbosity:choice.verbosity} : {})};
}
