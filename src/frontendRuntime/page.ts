/**
 * Serve the integrated React shell at the primary MauzCode URL
 *
 * Use after global authentication to proxy the root document to the managed Vite server; the served document gains the CSRF token and links to the brand favicon, apple-touch icon and web manifest. Internally marked legacy requests and API requests pass through unchanged.
 * @param opts.req Incoming browser request after the application authentication gate.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming browser request after the application authentication gate. */
        req: Request;
    },
): Promise<Response | void> {
    if ((session as Session & {legacyUi?: boolean})?.legacyUi) return;
    const url = new URL(opts.req.url);
    if (!['GET', 'HEAD'].includes(opts.req.method)) return;
    const match = /^\/(?:agent|a)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    if (match && match[1] !== 'new') {
      if (!(session as Session & {user?: object})?.user) return new Response('Authentication required', {status:401});
      url.pathname = '/'; url.searchParams.set('agent', match[1]!);
      return new Response(null, {status:307, headers:{location:url.pathname + url.search, 'cache-control':'no-store'}});
    }
    if (url.pathname !== '/') return;
    url.pathname = '/ui-lab/';
    const response = await ctx.fns.frontendBridge.proxy({req:new Request(url.toString(), {method:opts.req.method, headers:opts.req.headers})});
    // Embed the cookie-bound CSRF token once per page, so writes need no extra token round-trip, plus the brand icon links.
    if (!response || opts.req.method !== 'GET' || !response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
    const token = await ctx.fns.auth.csrfToken({req:opts.req});
    const esc = (value: string) => value.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]!);
    // Brand icons are server routes outside the Vite base, so they are linked here rather than in frontend/index.html
    // (Vite would prefix them with /ui-lab/).
    const icons = '<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/ui/app-icon?size=180"><link rel="manifest" href="/ui/manifest.webmanifest">';
    const csrf = token ? `<meta name="csrf-token" content="${esc(token)}">` : '';
    const html = (await response.text()).replace(/<head>/i, `<head>${csrf}${icons}`);
    const headers = new Headers(response.headers); headers.delete('content-length'); headers.set('vary', 'Cookie');
    return new Response(html, {status:response.status, headers});
}
