/**
 * Serve the isolated native React sign-in document
 *
 * Use only after login/setup availability guards. Returns a public document loading a fixed auth-only bundle, never the authenticated application shell. It links the public brand favicon, apple-touch icon and web manifest.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<Response> {
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MauzCode sign-in</title><link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/ui/app-icon?size=180"><link rel="manifest" href="/ui/manifest.webmanifest"><link rel="stylesheet" href="/auth/ui.css"></head><body><div id="root"></div><script type="module" src="/auth/ui.js"></script></body></html>`, {headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
