/** List recent voice diagnostics after verifying owner access. */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    return await ctx.fns.voice.journal.read({});
}
