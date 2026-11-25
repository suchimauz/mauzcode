/**
 * Synchronous gate for offering add_skill: the agent's frozen snapshot is the built-in Creator in every layer.
 *
 * Snapshot layers already include every parent layer, so a narrower parent removes the offer. Handlers still call skills.isCreator, which also checks stored ancestor snapshots.
 * @param opts.agent Trusted invoking agent.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Trusted invoking agent. */
        agent?: types.agent.Agent;
    },
): boolean {
    const snapshot = opts.agent?.preset;
    return !!snapshot && snapshot.presetId === 'creator' && Array.isArray(snapshot.layers) && snapshot.layers.length > 0
        && snapshot.layers.every(layer => layer.id === 'creator');
}
