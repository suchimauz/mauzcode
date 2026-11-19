/**
 * Read the effective voice route for one chat (public facade)
 *
 * Use before starting a dictation session or to render the current selection: the chat's scratchpad override
 * under `voice.route` wins, otherwise the global `voice.defaultRoute` setting is inherited; an empty route with
 * source `none` means voice dictation is unconfigured. Reports what is selected, including a selected-but-broken
 * route; availability is decided by voice.resolveRoute, which never falls back to another route.
 * @param opts.agentId Chat (agent) identifier whose scratchpad holds the per-chat override.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Chat (agent) identifier whose scratchpad holds the per-chat override. */
        agentId: string;
    },
): Promise<{ route: string; source: "override" | "default" | "none" }> {
    return ctx.fns.voice.route.effectiveRoute(opts);
}
