/**
 * Return inert provider marks for every registered model provider, keyed by provider id
 *
 * Use for React quota cards and other provider badges that need native MauzCode logos without injecting SVG markup.
 * Maps each registered provider's declared icon through frontendBridge.declaredIcon; a provider without a usable icon maps to null.
 * @param opts.req Incoming authenticated GET request.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Incoming authenticated GET request. */
        req: Request;
    },
): Promise<Response> {
    const headers = { 'Cache-Control': 'private, max-age=300', 'Vary': 'Cookie' };
    if (opts.req.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
    // Registered providers only; each mark comes from the shared resolver (brand, else plug, else declared icon).
    const icons = Object.fromEntries(await Promise.all(ctx.fns.models.providers({}).map(async p => {
        try { return [p.id, await ctx.fns.frontendBridge.modelMark({ provider: p.id }) ?? await ctx.fns.frontendBridge.declaredIcon({ icon: p.icon ?? null })] as const; } catch { return [p.id, null] as const; }
    })));
    return Response.json({ icons }, { headers });
}
