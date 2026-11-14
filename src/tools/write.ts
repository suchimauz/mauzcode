// Create a file, or replace a file that was read whole. Declared by
// $tool_write.md; callable by hand as ctx.fns.tools.write({ mode, path, content }).
//
// create  — write({ mode: "create", path, content }): refused when the path exists.
// replace — write({ mode: "replace", readId, content }): needs a readId from a
//           complete read; refused when the file changed since (conflict, with a
//           fresh readId so the next try needs no extra read).
// legacy  — write({ path, content }): overwrites without a version check, still
//           atomically, with a warning.
//
// The parse check is feedback, not a gate: the write stands either way, but a
// code file that does not even parse is a mistake the model can fix NOW.
/**
 * Creates a new file or replaces a fully read file, atomically and guarded by its readId; legacy path+content overwrites still work with a warning.
 *
 * Results are text starting with a status: applied, conflict, invalid, expired or busy; each non-applied status says nothing was written. Applied results carry a readId for the written file. For .ts/.tsx/.js/.jsx the result warns when the written code does not parse.
 * @param opts.mode create for a new file (refused if it exists), replace for a file read whole (needs readId).
 * @param opts.readId Receipt id from a complete read of the file; required for replace.
 * @param opts.host SSH host alias from ~/.ssh/config (see remote.servers), or "local"; omitted means the agent workspace.
 * @param opts.path File path; required for create and the legacy form, or must resolve to the receipt's file.
 * @param opts.content Full file body, written verbatim.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** create for a new file (refused if it exists), replace for a file read whole (needs readId). */
        mode?: "create" | "replace";
        /** Receipt id from a complete read of the file; required for replace. */
        readId?: string;
        /** SSH host alias from ~/.ssh/config (see remote.servers), or "local"; omitted means the agent workspace. */
        host?: string;
        /** File path; required for create and the legacy form, or must resolve to the receipt's file. */
        path?: string;
        /** Full file body, written verbatim. */
        content: string;
    },
): Promise<{ output: string; isError: boolean }> {
    const fail = (status: string, why: string) => ({ output: `${status}: ${why}\nnothing was written`, isError: true });
    const mode = opts.mode;
    if (mode != null && mode !== "create" && mode !== "replace") return fail("invalid", "`mode` must be create or replace");
    if (mode === "replace" && !opts.readId) return fail("invalid", "replace needs the `readId` of a complete read of the file");
    if (mode !== "replace" && opts.readId) return fail("invalid", "`readId` goes with mode replace");
    if (mode !== "replace" && (!opts.path?.trim() || opts.path.includes("\u0000"))) return fail("invalid", "write needs a valid file path");
    if (typeof opts.content !== "string") return fail("invalid", "`content` must be a string");

    let host: string | undefined;
    let path: string;
    let receipt: types.files.Receipt | undefined;
    if (mode === "replace") {
        const r = ctx.fns.files.useReceipt({ readId: opts.readId! });
        if (!r) return fail("expired", `readId ${opts.readId} is unknown or expired (receipts live 30 minutes, belong to one session and are lost on restart) — read the whole file again`);
        if (!r.complete) return fail("invalid", `readId ${r.id} covers lines ${r.start}-${r.end} of ${r.totalLines}; replace needs a read of the whole file`);
        if (opts.path != null || opts.host != null) {
            const at = ctx.fns.workspace.target({ host: opts.host, path: opts.path ?? r.path });
            const h = at.host ?? undefined;
            const p = h ? at.path : ctx.fns.files.resolveSafe({ path: opts.path ?? r.path });
            if (h !== r.host || p !== r.path) return fail("invalid", `path/host do not match readId ${r.id} (${r.host ? r.host + ":" : ""}${r.path})`);
        }
        receipt = r;
        host = r.host;
        path = r.path;
    } else {
        const at = ctx.fns.workspace.target({ host: opts.host, path: opts.path! });
        host = at.host ?? undefined;
        path = host ? at.path : opts.path!;
    }
    const shown = (host ? host + ":" : "") + path;

    try {
        await ctx.fns.files.write({
            path, host, content: opts.content,
            ifAbsent: mode === "create" || undefined,
            expectedVersion: receipt?.version,
        });
    } catch (error: any) {
        const refused = ctx.fns.files.refusalOf({ error });
        if (refused?.code === "busy") return fail("busy", error.message);
        if (refused?.code === "conflict") {
            if (mode === "create") return fail("conflict", `${shown} already exists — read it and use mode replace, or edit it`);
            if (receipt) ctx.fns.files.useReceipt({ readId: receipt.id, retire: true });
            const snap = await ctx.fns.files.snapshot({ path, host }).catch(() => null);
            const fresh = snap?.exists && !snap.binary ? ctx.fns.files.deliver({ snapshot: snap, maxLines: 400 }) : null;
            const note = fresh?.receipt
                ? fresh.receipt.complete
                    ? `\nthe current file follows with a new readId — check what changed before replacing it\n${fresh.text}`
                    : `\nthe start of the current file follows; read it whole before replacing it\n${fresh.text}`
                : "";
            return { output: `conflict: ${shown} changed since it was read\nnothing was written${note}`, isError: true };
        }
        throw error;
    }
    if (receipt) ctx.fns.files.useReceipt({ readId: receipt.id, retire: true });

    const lines = opts.content.split("\n").length;
    let output = `applied: ${mode === "create" ? "created" : "wrote"} ${shown} (${opts.content.length} bytes, ${lines} lines)`;
    if (!mode) output += "\nwarning: no mode/readId — the file was overwritten without a version check; use mode create or replace";
    const snap = await ctx.fns.files.snapshot({ path, host, content: opts.content });
    const issued = ctx.fns.files.issueReceipt({ snapshot: snap, start: 1, end: snap.lines.length });
    if (issued) output += "\n" + ctx.fns.files.receiptLine({ receipt: issued });

    const target = opts.path ?? path;
    const loader = /\.tsx$/.test(target) ? "tsx"
        : /\.ts$/.test(target) ? "ts"
        : /\.jsx$/.test(target) ? "jsx"
        : /\.(js|mjs)$/.test(target) ? "js"
        : null;
    if (loader) {
        try {
            new Bun.Transpiler({ loader: loader as any }).transformSync(opts.content);
        } catch (pe: any) {
            output += `\nWARNING: the file does NOT parse (${String(pe?.message ?? pe).split("\n")[0]?.slice(0, 160)}). ` +
                "Check for prose or a stray fragment in content and fix the file now.";
        }
    }
    return { output, isError: false };
}
