/** Approve or cancel one staged skill from its review card; the only path that can publish a skill. Answers JSON to the React card, HTML to the server card. */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Incoming browser request. */ req: Request;
    /** Route parameters with the review input id. */ params: Record<string, string>;
}): Promise<Response> {
    const json = (opts.req.headers.get('content-type') ?? '').includes('application/json');
    const headers = { 'content-type': json ? 'application/json' : 'text/html; charset=utf-8', 'cache-control': 'no-store' };
    const inputId = String(opts.params.inputId ?? '');
    try {
        let decision = '', digest = '';
        if (json) {
            const body = await opts.req.json().catch(() => null) as { decision?: unknown; digest?: unknown } | null;
            decision = String(body?.decision ?? ''); digest = String(body?.digest ?? '');
        } else {
            const form = await opts.req.formData().catch(() => null);
            decision = String(form?.get('decision') ?? ''); digest = String(form?.get('digest') ?? '');
        }
        const result = await ctx.fns.skills.add.decide({ req: opts.req, inputId, decision: decision as 'approve' | 'cancel', digest });
        if (json) return new Response(JSON.stringify(result), { status: 200, headers });
        return new Response(await ctx.fns.input.card({ id: inputId }), { status: result.ok ? 200 : 409, headers });
    } catch (error) {
        const e = error as Error & { status?: number };
        return new Response(json ? JSON.stringify({ error: e.message }) : '<p role="alert">' + Bun.escapeHTML(e.message) + '</p>', { status: e.status ?? 400, headers });
    }
}
