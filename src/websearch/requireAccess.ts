/**
 * Check the mounted websearch grant before entering a public operation.
 *
 * Checks frozen agent preset layers and explicit denies before any nested credential, engine or browser lookup.
 * @param opts.name Exact public runtime entrypoint being invoked.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact public runtime entrypoint being invoked. */
        name: string;
    },
): Promise<void> {
    const plugin = ctx.fns.plugins.list({}).some(p => p.name === 'websearch');
    const caller = session?.agent ?? (session?.agentId ? await ctx.fns.session.load({ id: session.agentId }) : null);
    if (!plugin || ((caller || session?.agentId) && (!caller?.preset || !ctx.fns.agentPreset.allows({ snapshot: caller.preset, name: opts.name })))) throw new Error(opts.name + ' is not available');
}
