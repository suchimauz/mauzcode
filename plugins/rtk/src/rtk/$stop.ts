/** Invalidate in-flight RTK enable operations and in-process verification when the plugin stops or unloads. */
export default async function (ctx: Context, _session: Session | null, _opts: {} = {}): Promise<void> {
    const state = (ctx.state.rtk ??= {});
    state.generation = (state.generation ?? 0) + 1;
    delete state.verifiedRevision;
}
