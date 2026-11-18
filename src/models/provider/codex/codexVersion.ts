/** Choose the resolved Codex client version sent on models and responses requests. */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Non-secret Codex connection configuration. */
        config: types.models.ResolvedConnection["config"];
    },
): Promise<string> {
    return (await ctx.fns.models.provider.codex.codexClientVersion({ config: opts.config })).version;
}
