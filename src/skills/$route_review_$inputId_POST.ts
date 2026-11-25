/** Approve or cancel one staged skill from its review card; the only path that can publish a skill. */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Incoming browser request. */ req: Request;
    /** Route parameters with the review input id. */ params: Record<string, string>;
}): Promise<Response> {
    const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
    try {
        const form = await opts.req.formData().catch(() => null);
        const decision = String(form?.get('decision') ?? '');
        const digest = String(form?.get('digest') ?? '');
        const result = await ctx.fns.skills.add.decide({ req: opts.req, inputId: String(opts.params.inputId ?? ''), decision: decision as 'approve' | 'cancel', digest });
        return new Response(await ctx.fns.input.card({ id: String(opts.params.inputId ?? '') }), { status: result.ok ? 200 : 409, headers });
    } catch (error) {
        const e = error as Error & { status?: number };
        return new Response('<p role="alert">' + Bun.escapeHTML(e.message) + '</p>', { status: e.status ?? 400, headers });
    }
}
