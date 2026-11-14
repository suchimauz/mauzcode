// POST /files?path=... — create a file with content (from <textarea name="content">).
// Never overwrites: an existing path answers 409 (saving an existing file is PUT).
// Redirects back to GET /files?path=... so the browser shows the fresh state.
/** Handles the corresponding HTTP route. */
export default async function (ctx: Context, _session: Session | null, opts: { /** Incoming HTTP request. */ req: Request; /** Route parameters. */ params: Record<string, string> }) {
    const url = new URL(opts.req.url);
    const path = url.searchParams.get("path") ?? "";
    if (!path) return new Response("missing ?path", { status: 400 });
    const host = url.searchParams.get("host") || undefined;
    if (host && !(await ctx.fns.remote.servers({})).some(s => s.name === host)) return new Response("unknown host", { status: 400 });
    const form = await opts.req.formData();
    const content = (form.get("content") as string) ?? "";
    try {
        await ctx.fns.files.write({ path, content, host, ifAbsent: true });
    } catch (error) {
        const refused = ctx.fns.files.refusalOf({ error });
        if (refused) return new Response(refused.code === "busy" ? "File is being saved by another writer; try again" : "File already exists; nothing was overwritten", { status: 409 });
        throw error;
    }
    return new Response(null, {
        status: 303,
        headers: { location: `/files?path=${encodeURIComponent(path)}${host ? `&host=${encodeURIComponent(host)}` : ""}` },
    });
}
