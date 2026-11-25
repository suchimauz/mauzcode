/**
 * Complete the current Antigravity sign-in with the pasted redirect address
 *
 * submitLogin action of the antigravity provider for a browser on another machine. Requires `flowId` and `code`
 * (the full address the browser landed on) from the Models login panel; see models.provider.antigravity.login.
 * @param opts.conn Resolved antigravity connection.
 * @param opts.input Action input `{ flowId, code }`.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection. */
        conn: types.models.ResolvedConnection;
        /** Action input `{ flowId, code }`. */
        input: types.models.ActionValue;
    },
): Promise<types.models.ActionValue> {
    const input = opts.input;
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.code !== "string" || typeof input.flowId !== "string") throw new Error("Redirect address and flow id are required");
    return ctx.fns.models.provider.antigravity.login({ conn: opts.conn, op: "submit", flowId: input.flowId, redirect: input.code });
}
