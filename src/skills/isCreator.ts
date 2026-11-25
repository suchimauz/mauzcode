/**
 * Decide whether an agent is a genuine built-in Creator for skill authoring and inventory.
 *
 * True only when the agent's frozen snapshot names the built-in creator preset in every layer and every ancestor chat's stored snapshot does too. Custom presets, including ones granting every function, never qualify; nothing is taken from tool arguments.
 * @param opts.agent Trusted invoking agent, never a client-supplied identity.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted invoking agent, never a client-supplied identity. */
        agent?: types.agent.Agent;
    },
): Promise<boolean> {
    const creator = (snapshot: types.agentPreset.Snapshot | null | undefined): boolean =>
        !!snapshot && snapshot.presetId === 'creator' && Array.isArray(snapshot.layers) && snapshot.layers.length > 0
        && snapshot.layers.every(layer => layer.id === 'creator');
    const agent = opts.agent;
    if (!agent?.id || !creator(agent.preset)) return false;
    const seen = new Set<string>([agent.id]);
    let parentId = agent.parentId ?? null;
    while (parentId) {
        if (seen.has(parentId) || seen.size > 64) return false;
        seen.add(parentId);
        const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT parent_id, preset_snapshot FROM agents WHERE id=?', params: [parentId] });
        if (!row) return false;
        const live = ctx.state.agent?.[parentId]?.preset;
        const stored = live ?? (typeof row.preset_snapshot === 'string' ? JSON.parse(row.preset_snapshot) : row.preset_snapshot);
        if (!creator(stored)) return false;
        parentId = row.parent_id ?? null;
    }
    return true;
}
