/**
 * Store the per-chat voice route override for one chat
 *
 * Use for the per-chat route selector. Writes the exact `<provider>/<accountName>:<modelId>` string into the
 * chat's own scratchpad under the single key `voice.route` through session.mutateScratchpad, so concurrent chat
 * mutations are not lost; the key contains a dot but stays one flat property name. The syntax is validated
 * before anything is stored, but the route is NOT checked for availability here: an unavailable saved route must
 * stay selected so voice.resolveRoute reports it explicitly, with no silent fallback to the default. The live
 * agent state gets the same single key update — never a wholesale replacement with the persisted snapshot, so
 * unrelated live-only scratchpad state survives — and metadata is refreshed, so the very next
 * voice.effectiveRoute sees the new value.
 * @param opts.agentId Chat (agent) identifier whose override is set.
 * @param opts.route Exact provider/accountName:modelId route to store for this chat only.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Chat (agent) identifier whose override is set. */
        agentId: string;
        /** Exact provider/accountName:modelId route to store for this chat only. */
        route: string;
    },
): Promise<{ ok: true; route: string }> {
    ctx.fns.voice.route.parseRoute({ route: opts.route });
    const id = String(opts.agentId ?? "").trim();
    const updated = await ctx.fns.session.mutateScratchpad({ id, mutate: (scratchpad: Record<string, any>) => { scratchpad["voice.route"] = opts.route; } });
    // Touch only this key on the live agent: assigning the persisted snapshot would drop unrelated
    // live-only scratchpad state that other subsystems keep in memory.
    const live = ctx.state.agent?.[id] as { scratchpad?: Record<string, any> } | undefined;
    if (live) {
        const scratchpad = live.scratchpad && typeof live.scratchpad === "object" && !Array.isArray(live.scratchpad)
            ? live.scratchpad
            : (live.scratchpad = {});
        scratchpad["voice.route"] = opts.route;
    }
    ctx.fns.events.refreshAgentMeta({ agentId: id, section: "all", reason: "voice-route" });
    return { ok: true, route: opts.route };
}
