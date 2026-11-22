/** Preload personal Markdown declarations once registered command kinds are ready. */
export default async function(ctx: Context, _session: Session | null, _opts?: {}) {
    await ctx.fns.commands.workspaceCommands({});
}
