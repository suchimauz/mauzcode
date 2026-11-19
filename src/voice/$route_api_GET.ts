/**
 * Serve the owner-only voice settings overview and an optional chat route state as JSON.
 * @param opts.req Authenticated owner request.
 * @param opts.params Route parameters (unused).
 */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    return await ctx.fns.voice.http.api({ req: opts.req });
}
