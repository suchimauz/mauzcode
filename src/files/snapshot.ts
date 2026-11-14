// The one place that turns a file's raw bytes into what the guarded tools need:
// a version, the LF view the model is shown, and the per-line terminators that
// let an edit re-encode exactly what it touched and nothing else.
/**
 * Reads a local or remote file as a versioned snapshot: sha256 of raw bytes, BOM, line endings and LF view.
 *
 * Use before a guarded edit or write to learn the exact version and line structure. A missing file returns exists:false; binary or invalid UTF-8 content returns binary:true with no text. Local files are capped at 10 MB like files.read.
 * @param opts.host Remote SSH host alias from ~/.ssh/config (see remote.servers); omitted means the local workspace.
 * @param opts.path Workspace-relative or absolute path; with host a remote path relative to the remote home.
 * @param opts.content Parse this text as the file's content instead of reading it (e.g. right after writing it).
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Remote SSH host alias from ~/.ssh/config (see remote.servers); omitted means local. */
        host?: string;
        /** Workspace-relative or absolute path; with host a remote path. */
        path: string;
        /** Parse this text as the file's content instead of reading it (e.g. right after writing it). */
        content?: string;
    },
): Promise<types.files.Snapshot> {
    let bytes: Uint8Array | null = null;
    let path = opts.path;
    if (opts.content != null) {
        if (!opts.host) path = ctx.fns.files.resolveSafe({ path });
        bytes = new TextEncoder().encode(opts.content);
    } else if (opts.host) {
        // Raw bytes over base64, so the version is the sha256 of what is on
        // disk and a BOM or invalid UTF-8 survives the transport.
        const rp = ctx.fns.remote.quote({ value: path, path: true });
        const r = await ctx.fns.remote.exec({
            host: opts.host,
            maxOutput: 16 * 1024 * 1024,
            command: "f=" + rp + '; [ -e "$f" ] || { echo __ABSENT__; exit 0; }; [ -f "$f" ] || { echo "not a file: $f" >&2; exit 2; }; s=$(wc -c < "$f"); [ $s -le 10485760 ] || { echo "File too large: $s bytes" >&2; exit 3; }; base64 < "$f"',
        });
        if (r.exitCode !== 0) throw new Error(`${opts.host}:${opts.path}: ${(r.stderr || "exit " + r.exitCode).trim()}`);
        if (r.stdout.trim() !== "__ABSENT__") bytes = new Uint8Array(Buffer.from(r.stdout.replace(/\s+/g, ""), "base64"));
    } else {
        path = ctx.fns.files.resolveSafe({ path });
        const f = Bun.file(path);
        const st = await f.stat().catch(() => null);
        if (st && !st.isDirectory()) {
            if (st.size > 10 * 1024 * 1024) throw new Error(`File too large: ${opts.path} (${(st.size / 1024 / 1024).toFixed(1)} MB, max 10 MB)`);
            bytes = new Uint8Array(await f.arrayBuffer());
        }
    }
    const base = { host: opts.host, path, bom: false, eol: "\n" as const, finalNewline: false, lines: [], text: "" };
    if (bytes == null) return { ...base, exists: false, version: null, binary: false, size: 0 };

    let text: string;
    let binary = false;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { text = ""; binary = true; }
    if (text.includes("\u0000")) binary = true;
    const version = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    if (binary) return { ...base, exists: true, version, binary: true, size: bytes.length };

    const bom = text.startsWith("\uFEFF");
    const body = bom ? text.slice(1) : text;
    const lines: { text: string; eol: string }[] = [];
    let crlf = 0, lf = 0, from = 0;
    for (;;) {
        const at = body.indexOf("\n", from);
        if (at < 0) { lines.push({ text: body.slice(from), eol: "" }); break; }
        const cr = at > from && body[at - 1] === "\r";
        if (cr) crlf++; else lf++;
        lines.push({ text: body.slice(from, cr ? at - 1 : at), eol: cr ? "\r\n" : "\n" });
        from = at + 1;
    }
    return {
        host: opts.host, path, exists: true, version, binary: false, size: bytes.length, bom,
        eol: crlf > lf ? "\r\n" : "\n",
        finalNewline: body.endsWith("\n"),
        lines,
        text: lines.map(l => l.text).join("\n"),
    };
}
