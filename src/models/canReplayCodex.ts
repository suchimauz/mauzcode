/** Check a locally persisted Codex checkpoint or chat sticky state against the selected connection without networking. Dispatch repeats verification with its own immutable credential tuple. */
export default async function (
    ctx: Context, _session: Session | null,
    opts: {
        /** Current target connection UUID. */
        connectionId: string;
        /** Current provider-native model, for checkpoint compatibility. */
        model: string;
        /** Persisted SDK checkpoint to authenticate; never raw transcript content. */
        checkpoint?: types.models.Checkpoint;
        /** Run-scoped chat state to authenticate. */
        state?: types.models.ProviderState;
    },
): Promise<boolean> {
    if (!opts.checkpoint && !opts.state || opts.checkpoint && opts.checkpoint.model !== opts.model) return false;
    try {
        await ctx.fns.models.provider.codex.codexCheckOpaque({connectionId: opts.connectionId, state: opts.state, messages: opts.checkpoint ? [{type:'checkpoint', checkpoint:opts.checkpoint}] : []});
        return true;
    } catch (error) {
        if ((error as { code?: string })?.code === 'INVALID_INPUT') return false;
        throw error;
    }
}
