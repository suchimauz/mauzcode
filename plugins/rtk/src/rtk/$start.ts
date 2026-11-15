/** Start a fresh RTK lifecycle generation: in-process verification from a previous lifecycle is discarded, persisted intent is kept. */
export default async function (ctx: Context, _session: Session | null, _opts: {} = {}): Promise<void> {
    const state = (ctx.state.rtk ??= {});
    state.generation = (state.generation ?? 0) + 1;
    delete state.verifiedRevision;
}
