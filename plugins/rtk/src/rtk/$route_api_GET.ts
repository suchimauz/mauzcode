/** Owner-only RTK control state and CSRF token for the RTK settings tab. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    return await ctx.fns.rtk.api({ req: opts.req });
}
