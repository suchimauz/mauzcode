/**
 * Recognizes an error thrown by files.write as a refusal and returns its fields, or null for any other error.
 *
 * Use in routes and tools to map a refused write to 409 or a busy/conflict status without parsing messages.
 * @param opts.error Any caught value.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Any caught value. */
        error: unknown;
    },
): types.files.WriteRefusal | null {
    const e = opts.error as any;
    if (!e || typeof e !== "object" || (e.code !== "conflict" && e.code !== "busy")) return null;
    return { code: e.code, reason: e.reason, lockPath: e.lockPath, owner: e.owner };
}
