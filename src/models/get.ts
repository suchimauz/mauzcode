/**
 * Read one model connection without secret values
 *
 * Use to show or edit a single connection. Throws an error with `code: "NOT_FOUND"` when the id is malformed or unknown. Secret fields are reported only as set/not set.
 * @param opts.id Connection UUID.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
    },
): Promise<types.models.ConnectionView> {
    return ctx.fns.models.connections.get(opts);
}
