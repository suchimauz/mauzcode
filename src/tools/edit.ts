// Edit a file in place from STRUCTURED edits, bound to what was read.
//
// Guarded form: edit({ readId, mode, edits }). The receipt names the file, host,
// version and delivered lines; the engine (files.applyEdits) refuses an edit
// whose file changed (conflict — with fresh content and a new readId so no
// extra read is needed), whose anchors or matches lie outside the delivered
// lines (invalid), or whose lock is held (busy).
//
// Legacy form: edit({ path, edits }) — applied to the current file without a
// version check, still atomically; the result says so and carries a readId.
//
// Two families, never mixed in one call: literal replacement (oldText/newText)
// and anchored line ops (anchor/endAnchor/text).
/**
 * Applies structured literal or anchored edits to a file read earlier, checked against that read's readId; legacy path-only edits still work with a warning.
 *
 * Results are text starting with a status: applied, conflict, invalid, expired or busy. Every non-applied status says nothing was written; applied and conflict results carry a new readId (conflict also carries the fresh content of the same range).
 * @param opts.readId Receipt id from the first line of a read result; names the file, host, version and readable range.
 * @param opts.mode literal for oldText/newText replacements, anchor for anchored line ops; required with readId.
 * @param opts.host SSH host alias from ~/.ssh/config (see remote.servers), or "local"; legacy form only, or must match the receipt.
 * @param opts.path File path; legacy form, or must resolve to the receipt's file.
 * @param opts.edits Structured edit operations of one mode.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Receipt id from the first line of a read result. */
        readId?: string;
        /** literal or anchor; required with readId. */
        mode?: "literal" | "anchor";
        /** SSH host alias from ~/.ssh/config (see remote.servers), or "local"; legacy form only, or must match the receipt. */
        host?: string;
        /** File path; legacy form, or must resolve to the receipt's file. */
        path?: string;
        /** Structured edit operations of one mode. */
        edits: types.tools.EditOp[];
    },
): Promise<{ output: string; isError: boolean }> {
    const fail = (status: string, why: string) => ({ output: `${status}: ${why}\nnothing was written`, isError: true });
    const complaints = ctx.fns.tools.editValidate({ args: opts });
    if (complaints.length) return fail("invalid", complaints.join("; "));

    let receipt: types.files.Receipt | undefined;
    let host: string | undefined;
    let path: string;
    if (opts.readId) {
        const r = ctx.fns.files.useReceipt({ readId: opts.readId });
        if (!r) return fail("expired", `readId ${opts.readId} is unknown or expired (receipts live 30 minutes, belong to one session and are lost on restart) — read the file again`);
        receipt = r;
        host = r.host;
        path = r.path;
        if (opts.path != null || opts.host != null) {
            const at = ctx.fns.workspace.target({ host: opts.host, path: opts.path ?? r.path });
            const h = at.host ?? undefined;
            const p = h ? at.path : ctx.fns.files.resolveSafe({ path: opts.path ?? r.path });
            if (h !== r.host || p !== r.path) return fail("invalid", `path/host do not match readId ${r.id} (${r.host ? r.host + ":" : ""}${r.path}) — omit them or read the other file`);
        }
    } else {
        const at = ctx.fns.workspace.target({ host: opts.host, path: opts.path! });
        host = at.host ?? undefined;
        path = host ? at.path : opts.path!;
    }

    const ops = opts.edits.map(toOp);
    const shown = (host ? host + ":" : "") + path;
    try {
        const r = await ctx.fns.files.applyEdits({ path, host, ops, receipt });
        if (receipt) ctx.fns.files.useReceipt({ readId: receipt.id, retire: true });
        const n = opts.edits.length;
        const c = r.changed;
        // Receipt for the edited span plus a little context, so chained edits
        // need no extra read.
        const start = Math.max(1, c.start - 3);
        const end = Math.max(start, c.start + Math.max(c.added, 1) + 2);
        const fresh = ctx.fns.files.deliver({ snapshot: r.snapshot, startLine: start, endLine: end, hashline: opts.mode === "anchor" });
        const head = `applied: ${shown} (${r.bytes} bytes, ${n} edit${n === 1 ? "" : "s"}; lines ${c.start}-${c.start + c.added - 1} now, ${c.removed} line${c.removed === 1 ? "" : "s"} replaced)`;
        const warn = receipt ? "" : "\nwarning: no readId — edit was applied to the current file without a version check";
        return { output: head + warn + (fresh.receipt ? "\n" + fresh.text : ""), isError: false };
    } catch (error: any) {
        if (error?.code === "invalid") return fail("invalid", error.message);
        const refused = ctx.fns.files.refusalOf({ error });
        if (refused?.code === "busy") return fail("busy", error.message);
        if (refused?.code === "conflict") {
            if (receipt) ctx.fns.files.useReceipt({ readId: receipt.id, retire: true });
            const snap = await ctx.fns.files.snapshot({ path, host }).catch(() => null);
            if (!snap?.exists || snap.binary) return fail("conflict", `${shown} changed since it was read and is no longer readable text`);
            const fresh = ctx.fns.files.deliver({
                snapshot: snap,
                startLine: receipt?.start ?? 1,
                endLine: receipt ? receipt.end : undefined,
                maxLines: receipt ? undefined : 400,
                hashline: opts.mode === "anchor",
            });
            return { output: `conflict: ${shown} changed since it was read\nnothing was written — the current content of the same lines follows; redo the edit against it\n${fresh.text}`, isError: true };
        }
        throw error;
    }
}

function toOp(edit: types.tools.EditOp, i: number): types.files.EditHashlineOp {
    const op = edit.op ?? (edit.oldText != null ? "replace" : undefined);
    const lines = () => String(edit.text ?? "").split("\n");

    if (op === "replace") {
        return { kind: "literal_replace", old: String(edit.oldText ?? ""), replacement: String(edit.newText ?? ""), all: edit.all === true };
    }
    if (op === "insertBefore" || op === "insertAfter") {
        if (!edit.anchor) throw new Error(`edits[${i}].anchor is required for ${op}`);
        return { kind: op === "insertBefore" ? "insert_before" : "insert_after", anchor: edit.anchor, lines: lines() };
    }
    if (op === "replaceLines") {
        if (!edit.anchor) throw new Error(`edits[${i}].anchor is required for replaceLines`);
        return { kind: "replace", start: edit.anchor, end: edit.endAnchor, lines: lines() };
    }
    if (op === "delete") {
        if (!edit.anchor) throw new Error(`edits[${i}].anchor is required for delete`);
        return { kind: "delete", start: edit.anchor, end: edit.endAnchor };
    }
    throw new Error(`edits[${i}] needs either oldText/newText or an op with an anchor`);
}
