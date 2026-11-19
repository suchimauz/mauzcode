/** Look up an exact voice diagnostic reference after verifying owner access. */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    return await ctx.fns.voice.journal.read({ id: opts.params.id });
}
