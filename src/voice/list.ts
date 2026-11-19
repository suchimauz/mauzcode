/**
 * List stored voice connections without secret values
 *
 * Use for settings screens and connection pickers. Returns every connection (including ones whose provider is no
 * longer registered) in creation order, optionally filtered by provider. Secret fields are reported only as
 * set/not set.
 * @param opts.provider Only connections of this provider id.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Only connections of this provider id. */
        provider?: string;
    },
): Promise<types.voice.ConnectionView[]> {
    return ctx.fns.voice.connections.list(opts);
}
