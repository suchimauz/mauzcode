/**
 * Native `read_result` adapter: bounded range read of a stored tool or trigger result.
 *
 * Delegates to `agent.readResult` with the invoking agent bound from the trusted tool invocation, so
 * ownership, fork boundaries, clamping and error codes are identical to the eval route. Rejects unknown
 * arguments; never accepts an agent identity from arguments. Its output is returned inline by
 * `agent.stashResult`, never stored again.
 * @param opts.id Immutable result UUID from a tool preview; old rN aliases return legacy_unavailable.
 * @param opts.offset Starting JavaScript UTF-16 position. @default 0 @minimum 0
 * @param opts.limit Maximum JavaScript UTF-16 units returned. @default 4000 @minimum 1 @maximum 16000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Immutable result UUID from a tool preview; old rN aliases return legacy_unavailable. */
        id: string;
        /** Starting JavaScript UTF-16 position. @default 0 @minimum 0 */
        offset?: number;
        /** Maximum JavaScript UTF-16 units returned. @default 4000 @minimum 1 @maximum 16000 */
        limit?: number;
    },
): Promise<{ ok: true; text: string; totalChars: number; offset: number; truncated: boolean } | { ok: false; error: string }> {
    const unknown = Object.keys(opts ?? {}).filter(key => !["id", "offset", "limit"].includes(key));
    if (unknown.length) throw new Error(`read_result: unknown argument ${unknown.join(", ")}`);
    if (typeof opts.id !== "string" || !opts.id.trim()) throw new Error("read_result: id must be a non-empty string");
    // agent.readResult resolves the caller from the session; require it to be the trusted tool agent.
    if (!session?.agent?.id) throw new Error("read_result: requires a trusted agent invocation");
    return ctx.fns.agent.readResult({ id: opts.id.trim(), offset: opts.offset, limit: opts.limit });
}
