/**
 * Remove the per-chat voice route override and restore inheritance
 *
 * Use for the "use default" selector in a chat. Deletes the `voice.route` key from the chat's scratchpad
 * through session.mutateScratchpad, so the next voice.effectiveRoute call inherits the global
 * `voice.defaultRoute` again; the default itself is never modified, and other chats are unaffected. The live
 * agent state gets the same single key removal — never a wholesale replacement with the persisted snapshot,
 * so unrelated live-only scratchpad state survives — and metadata is refreshed. Clearing an already clear
 * override is idempotent.
 * @param opts.agentId Chat (agent) identifier whose override is cleared.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Chat (agent) identifier whose override is cleared. */
        agentId: string;
    },
): Promise<{ ok: true; cleared: boolean }> {
    const id = String(opts.agentId ?? "").trim();
    const updated = await ctx.fns.session.mutateScratchpad({ id, mutate: (scratchpad: Record<string, any>) => {
        const had = Object.hasOwn(scratchpad ?? {}, "voice.route");
        if (had) delete scratchpad["voice.route"];
        return had;
    } });
    // Remove only this key on the live agent; the persisted snapshot would drop unrelated live-only state.
    const live = ctx.state.agent?.[id] as { scratchpad?: Record<string, any> } | undefined;
    if (live && live.scratchpad && typeof live.scratchpad === "object" && !Array.isArray(live.scratchpad)) {
        delete live.scratchpad["voice.route"];
    }
    if (updated.result) ctx.fns.events.refreshAgentMeta({ agentId: id, section: "all", reason: "voice-route" });
    return { ok: true, cleared: updated.result === true };
}
