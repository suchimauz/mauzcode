// Read a file, optionally a line range, optionally in hashline form (anchors
// instead of line numbers). Text results start with a `readId:` line — the
// receipt `edit` and `write` need. Declared by $tool_read.md; callable by hand
// as ctx.fns.tools.read({ path, hashline: true }) (no readId without a session).
/**
 * Reads a workspace file as text, a line range, hashline anchors, or an image
 *
 * Returns file text, optionally sliced by line range or prefixed with stable
 * hashline anchors. Text results start with a `readId:` header line naming the
 * receipt for the exact version and delivered range, which `edit` and `write`
 * take; session-less calls, binary files and images get no readId. A path ending in .png, .jpg, .jpeg, .gif or .webp
 * returns the image as model-visible content so agents can look at screenshots.
 * @param opts.path File path, relative to the workspace or absolute.
 * @param opts.startLine First line to return, one-based. @default 1 @minimum 1
 * @param opts.endLine Last line to return, inclusive; omitted means end of file. @minimum 1
 * @param opts.maxLines Maximum number of lines to return. @minimum 1
 * @param opts.hashline Prefix each line with a stable anchor for edit. @default false
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** SSH host alias from ~/.ssh/config (see remote.servers), or "local"; omitted means the agent workspace (remote when workspace.set gave it a host). */
        host?: string;
        /** File path, relative to the workspace or absolute. */
        path: string;
        /** First line to return, one-based. @default 1 @minimum 1 */
        startLine?: number;
        /** Last line to return, inclusive; omitted means end of file. @minimum 1 */
        endLine?: number;
        /** Maximum number of lines to return. @minimum 1 */
        maxLines?: number;
        /** Prefix each line with a stable anchor for edit. @default false */
        hashline?: boolean;
    },
): Promise<string | { output: string; content: types.tools.Content[] }> {
    // An image path returns the picture itself as model-visible content, so
    // "read the screenshot" works the same way for every agent and provider.
    // Where this call acts: explicit host, "local", or the agent's workspace host.
    const at = ctx.fns.workspace.target({ host: opts.host, path: opts.path });
    const host = at.host ?? undefined;
    const path = host ? at.path : opts.path;
    if (host && !opts.hashline && /\.(png|jpe?g|gif|webp)$/i.test(opts.path)) {
        const { tmpdir } = await import("node:os");
        const { join, extname } = await import("node:path");
        const { mkdtemp, rm } = await import("node:fs/promises");
        // Private per-call directory, removed once the image is in memory.
        const dir = await mkdtemp(join(tmpdir(), "mauzcode-remote-"));
        let image: types.tools.Content;
        try {
            const local = join(dir, "image" + extname(opts.path));
            await ctx.fns.remote.rsync({ host, direction: "pull", remote: path, local });
            image = await ctx.fns.agent.imageContent({ path: local });
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
        return { output: `[image: ${host}:${path}]`, content: [image] };
    }
    if (!opts.hashline && /\.(png|jpe?g|gif|webp)$/i.test(opts.path)) {
        const path = ctx.fns.workspace.resolve({ path: opts.path });
        const image = await ctx.fns.agent.imageContent({ path });
        return { output: `[image: ${opts.path}]`, content: [image] };
    }
    // Text: deliver through a snapshot so the result carries a readId for the
    // exact version and range shown (first line; none without a session).
    const snap = await ctx.fns.files.snapshot({ path, host });
    if (!snap.exists) throw new Error(`no such file: ${host ? host + ":" : ""}${path}`);
    if (snap.binary) {
        // Binary or invalid UTF-8: shown as before, never with a receipt.
        const text = await ctx.fns.files.read({ path, host });
        const start = Math.max(1, opts.startLine ?? 1);
        const lines = text.replaceAll("\r\n", "\n").split("\n");
        let end = Math.max(start, opts.endLine ?? lines.length);
        if (opts.maxLines != null) end = Math.min(end, start + Math.max(0, opts.maxLines - 1));
        return lines.slice(start - 1, end).join("\n");
    }
    return ctx.fns.files.deliver({
        snapshot: snap, startLine: opts.startLine, endLine: opts.endLine, maxLines: opts.maxLines, hashline: opts.hashline,
    }).text;
}
