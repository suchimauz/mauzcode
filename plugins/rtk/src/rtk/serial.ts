/**
 * Runs RTK check/enable/revalidate steps one at a time inside this process.
 *
 * Use to order probe-and-commit operations so concurrent checks complete in submission order; revision checks in
 * rtk.commit still reject results that became stale. Disable deliberately does not wait here, so it can invalidate
 * an enable that is still probing.
 * @param opts.run Operation to run after earlier queued operations settle.
 */
export default async function <T>(
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Operation to run after earlier queued operations settle. */
        run: () => Promise<T>;
    },
): Promise<T> {
    const state = (ctx.state.rtk ??= {});
    const previous = state.queue ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(opts.run);
    state.queue = next.catch(() => undefined);
    return await next;
}
