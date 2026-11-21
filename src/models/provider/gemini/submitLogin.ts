/**
 * Submit a pasted Gemini authorization code for the current login flow
 *
 * submitLogin action of the gemini provider. Requires `{ flowId, code }` and forwards them to models.provider.gemini.login op submit; returns only the public flow view.
 * @param opts.conn Resolved gemini connection.
 * @param opts.input Action input with flowId and the pasted code.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection. */
        conn: types.models.ResolvedConnection;
        /** Action input with flowId and the pasted code. */
        input: types.models.ActionValue;
    },
): Promise<types.models.ActionValue> {
    const input = opts.input as Record<string, unknown> | null;
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.code !== "string" || typeof input.flowId !== "string") throw Object.assign(new Error("Authorization code and flow id are required"), { status: 400 });
    return await ctx.fns.models.provider.gemini.login({ conn: opts.conn, op: "submit", flowId: input.flowId, code: input.code }) as types.models.ActionValue;
}
