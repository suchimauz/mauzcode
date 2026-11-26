/**
 * Changes the durable reasoning effort preference of one agent
 *
 * Validate and persist one agent reasoning effort preference, update the live agent object, record a visible event and refresh the chat. Use for an explicit owner choice on the current route. The preference belongs to that route: agent.setModel resets it to `auto` in the same write when the provider or model slug changes, keeps it on a same-slug connection switch only when the target's cached catalogue lists it, and leaves it untouched on same-route selection and connection renames; the connection normalizes it during inference. Unsupported explicit levels fail before any state change.
 * @param opts.id Agent identifier.
 * @param opts.effort Requested reasoning preference.
 * @param opts.now Current timestamp in milliseconds, for testing.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent identifier. */
        id: string;
        /** Requested reasoning preference. */
        effort: (types.models.ReasoningLevel | "auto");
        /** Current timestamp in milliseconds, for testing. */
        now?: number;
    },
): Promise<{ id: string; requested: (types.models.ReasoningLevel | "auto"); applied: (types.models.ReasoningLevel | "auto"); downgraded: boolean }> {
    const allowed: (types.models.ReasoningLevel | "auto")[] = ["auto", "off", "minimal", "low", "medium", "high", "xhigh", "max"];
    if (!allowed.includes(opts.effort)) throw new Error("invalid reasoning effort");
    const row = ((await ctx.fns.procs.db.select({ sql: "SELECT id, model, reasoning_effort FROM agents WHERE id = ? AND archived_at IS NULL", params: [opts.id] })) as any[])[0];
    if (!row) throw new Error(`agent not found: ${opts.id}`);
    const previous = String(row.reasoning_effort ?? "auto") as (types.models.ReasoningLevel | "auto");
    const route = await ctx.fns.models.resolveRoute({ route: String(row.model) });
    const catalogue = await ctx.fns.models.listModels({ id: route.connectionId });
    const reasoning = catalogue.models.find(model => model.id === route.model)?.reasoning;
    if (opts.effort !== 'auto' && !reasoning?.supported.includes(opts.effort)) throw new Error('unsupported reasoning effort');
    const resolved = { applied: opts.effort === 'auto' ? reasoning?.default ?? 'auto' as const : opts.effort, downgraded: false };
    if (previous !== opts.effort) {
        await ctx.fns.procs.db.run({ sql: "UPDATE agents SET reasoning_effort = ?, updated_at = ? WHERE id = ?", params: [opts.effort, opts.now ?? Date.now(), opts.id] });
        const live = (ctx.state as any).agent?.[opts.id];
        if (live) live.reasoningEffort = opts.effort;
        await ctx.fns.session.appendEvent({ id: opts.id, event: { type: "reasoning_effort_changed", from: previous, to: opts.effort, applied: resolved.applied } }).catch(() => undefined);
        try { ctx.fns.events.emitAgentsChanged({ agentId: opts.id, reason: "reasoning-effort" }); } catch {}
    }
    return { id: opts.id, requested: opts.effort, applied: resolved.applied, downgraded: resolved.downgraded };
}
