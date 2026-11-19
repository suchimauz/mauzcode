/**
 * Read the effective voice route for one chat without resolving it
 *
 * Use before a session start or to render the current selection. The chat's own scratchpad key `voice.route`
 * (written by setOverride/clearOverride) wins; when the key is absent or empty the chat inherits the persisted
 * global setting `voice.defaultRoute`. Returns only the route string and where it came from — `override`,
 * `default` or `none` — and never falls back to another route: `route` is an empty string when nothing is
 * selected, and a selected but broken route stays selected for voice.resolveRoute to report as unavailable.
 * Reads current settings and stored agents, so a preference change applies to the very next call.
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
    const id = String(opts.agentId ?? "").trim();
    const agent = ctx.state.agent?.[id] ?? await ctx.fns.session.load({ id });
    if (!agent) throw Object.assign(new Error(`agent not found: ${id}`), { code: "NOT_FOUND", status: 404 });
    const override = (agent.scratchpad as Record<string, any> | undefined)?.["voice.route"];
    if (typeof override === "string" && override.trim()) return { route: override, source: "override" };
    const fallback = await ctx.fns.settings.get({ module: "voice", scopeType: "global", key: "defaultRoute" });
    if (typeof fallback === "string" && fallback.trim()) return { route: fallback, source: "default" };
    return { route: "", source: "none" };
}
