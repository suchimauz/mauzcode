/**
 * Owner-only HTTP API behind the RTK settings tab (GET/POST /rtk/api).
 *
 * GET returns the RTK control state and a cookie-bound CSRF token; it never probes or changes anything. POST takes
 * `{ action: "check" | "enable" | "disable" }` as JSON (at most 1 KiB) and requires the owner, same origin and a valid
 * `x-csrf-token`. check never enables; enable succeeds only after a fresh successful check (409 otherwise); disable is
 * immediate. Non-owners get 403, anonymous 401. Responses are no-store and contain only safe facts.
 * @param opts.req Incoming GET or JSON POST request.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Incoming GET or JSON POST request. */
        req: Request;
    },
): Promise<Response> {
    const req = opts.req;
    const headers = { 'Cache-Control': 'no-store', 'Vary': 'Cookie' };
    const reply = (body: object, status = 200) => Response.json(body, { status, headers });
    if (!['GET', 'POST'].includes(req.method)) return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, POST' } });
    const who = await ctx.fns.auth.currentUser({ req });
    if (who.required && !who.user && !who.legacy) return reply({ error: 'Unauthorized' }, 401);
    if (who.user && (who.user.role !== 'owner' || (who.user as { disabledAt?: number | null }).disabledAt != null)) return reply({ error: 'Owner access required' }, 403);
    try {
        if (req.method === 'GET') return reply({ control: await ctx.fns.rtk.status({}), csrfToken: await ctx.fns.auth.csrfToken({ req }) });
        if (req.headers.get('sec-fetch-site') === 'cross-site' || (req.headers.has('origin') && req.headers.get('origin') !== await ctx.fns.http.publicOrigin({ req }))) return reply({ error: 'Same origin required' }, 403);
        if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get('x-csrf-token') ?? '' })) return reply({ error: 'Invalid request token' }, 403);
        if (req.headers.get('content-type')?.split(';')[0] !== 'application/json') return reply({ error: 'JSON required' }, 415);
        const raw = await req.text(); if (raw.length > 1024) return reply({ error: 'Request too large' }, 413);
        let body: { action?: unknown };
        try { body = JSON.parse(raw); } catch { return reply({ error: 'Invalid JSON' }, 400); }
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'action')) return reply({ error: 'Invalid fields' }, 400);
        if (body.action === 'check') { const r = await ctx.fns.rtk.check({}); return reply({ control: r.control, probe: { ok: r.probe.ok, code: r.probe.code, reason: r.probe.reason }, stale: r.stale }); }
        if (body.action === 'enable') { const r = await ctx.fns.rtk.enable({}); return reply(r.ok ? { control: r.control } : { control: r.control, error: r.reason ?? 'RTK could not be enabled', code: r.error }, r.ok ? 200 : 409); }
        if (body.action === 'disable') return reply({ control: await ctx.fns.rtk.disable({}) });
        return reply({ error: 'Unsupported action' }, 400);
    } catch {
        return reply({ error: 'RTK request failed' }, 500);
    }
}
