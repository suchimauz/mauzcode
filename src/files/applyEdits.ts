// Apply a list of edit operations to a file — the engine every edit path reaches.
//
// The file is taken as a snapshot (files.snapshot): exact version, LF view and
// each line's own terminator. Anchored ops address lines by `<line><hash>`
// anchors verified against that snapshot; literal ops match the LF view and
// must match exactly once (or at least once with `all`). The two kinds are not
// mixed in one call, because a literal replacement shifts the anchors after it.
//
// Line endings: an edit rewrites only the lines it touches. Untouched lines keep
// their bytes, new lines get the file's dominant EOL, the final-newline state
// and BOM stay as they were.
//
// Guarding: with a receipt, the snapshot must still be the version the receipt
// names, every anchor and literal match must lie inside the lines it delivered,
// and the publish is conditional on that version inside the commit lock
// (files.write expectedVersion). Without one (legacy), the current file is the
// base and the publish is still conditional on it, so nothing that lands
// between this read and the rename is overwritten.
//
// Failures throw: `invalid` errors (code "invalid") for bad ops, and the
// files.refusal errors (code "conflict" / "busy") for a changed file or a held lock.

type Line = { text: string; eol: string };
type OutLine = { text: string; eol: string | null };

function invalid(message: string): Error {
    const e = new Error(message) as Error & { code: string };
    e.code = "invalid";
    return e;
}

/**
 * Applies literal or hashline-anchored edits to a local or SSH file atomically, optionally guarded by a read receipt.
 *
 * Use for every structured edit: the edit tool, files.editHashline and scripts. Preserves untouched line bytes, the dominant EOL for new lines, the final newline and the BOM. With receipt the edit is refused with a conflict error when the file is no longer the receipt's version and with an invalid error when an anchor or match lies outside its delivered range; publishing is conditional on the version inside the commit lock either way. Errors carry code invalid, conflict or busy.
 * @param opts.host Remote SSH host alias from ~/.ssh/config (see remote.servers); omitted means the local workspace.
 * @param opts.path Workspace-relative or absolute path; with host a remote path relative to the remote home.
 * @param opts.ops Ordered edit operations to apply, all literal or all anchored.
 * @param opts.receipt Read receipt the edit is based on (from files.useReceipt); omitted means the current file (legacy).
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Remote SSH host alias from ~/.ssh/config (see remote.servers); omitted means local. */
        host?: string;
        /** Workspace-relative path, or remote path when host is set. */
        path: string;
        /** Ordered edit operations to apply, all literal or all anchored. */
        ops: types.files.EditHashlineOp[];
        /** Read receipt the edit is based on (from files.useReceipt); omitted means the current file (legacy). */
        receipt?: types.files.Receipt;
    },
): Promise<{ path: string; bytes: number; diff: string; content: string; version: string; changed: { start: number; end: number; added: number; removed: number }; snapshot: types.files.FileSnapshot }> {
    const { path, ops, receipt } = opts;
    if (!ops.length) throw invalid("no edits — nothing to do");
    const snap = await ctx.fns.files.snapshot({ path, host: opts.host });
    const shown = opts.host ? `${opts.host}:${path}` : path;
    if (!snap.exists) throw invalid(`no such file: ${shown} — create it with write`);
    if (snap.binary) throw invalid(`not a text file (binary or invalid UTF-8): ${shown}`);
    if (receipt && snap.version !== receipt.version) {
        throw ctx.fns.files.refusal({ code: "conflict", reason: "changed", target: shown });
    }
    const lines = snap.lines;
    const range = receipt ? { start: receipt.start, end: Math.min(receipt.end, lines.length) } : { start: 1, end: lines.length };
    const literal = ops.filter((op): op is Extract<types.files.EditHashlineOp, { kind: "literal_replace" }> => op.kind === "literal_replace");
    if (literal.length && literal.length !== ops.length) throw invalid("literal replace cannot be mixed with anchored ops");

    const out = literal.length ? applyLiteral(snap, literal, range) : applyAnchored(ctx, snap, ops, range, receipt);

    // Terminators: every line but the last needs one; the last keeps its own.
    const finalLines: Line[] = out.map((l, i) => ({
        text: l.text,
        eol: i < out.length - 1 ? (l.eol || snap.eol) : (l.eol ?? ""),
    }));
    if (finalLines.length) {
        const last = finalLines[finalLines.length - 1]!;
        if (snap.finalNewline && last.text !== "") {
            if (!last.eol) last.eol = snap.eol;
            finalLines.push({ text: "", eol: "" });
        } else if (!snap.finalNewline && last.eol) {
            last.eol = "";
        }
    }
    const content = ctx.fns.files.encodeLines({ lines: finalLines, bom: snap.bom });
    const before = ctx.fns.files.encodeLines({ lines, bom: snap.bom });

    // Changed span of the new file: strip the common prefix and suffix.
    let p = 0;
    while (p < lines.length && p < finalLines.length && lines[p]!.text === finalLines[p]!.text && lines[p]!.eol === finalLines[p]!.eol) p++;
    let q = 0;
    while (q < lines.length - p && q < finalLines.length - p
        && lines[lines.length - 1 - q]!.text === finalLines[finalLines.length - 1 - q]!.text
        && lines[lines.length - 1 - q]!.eol === finalLines[finalLines.length - 1 - q]!.eol) q++;
    const changed = { start: p + 1, end: finalLines.length - q, added: finalLines.length - q - p, removed: lines.length - q - p };
    if (content === before) throw invalid("the edits change nothing");

    const res = await ctx.fns.files.write({ path, host: opts.host, content, expectedVersion: snap.version! });
    const diff = await ctx.fns.markdown.highlight({
        code: `--- ${path}\n+++ ${path}\n${before}\n---\n${content}`,
        lang: "diff",
    }).catch(() => "");
    const after = await ctx.fns.files.snapshot({ path, host: opts.host, content });
    return { path, bytes: res.bytes, diff, content, version: res.version, changed, snapshot: after };
}

// Literal: matches are found in the LF view, only inside the delivered range,
// then each is spliced back as whole lines so lines it does not touch keep
// their bytes. Matches that share a line are applied together.
function applyLiteral(
    snap: types.files.FileSnapshot,
    ops: Extract<types.files.EditHashlineOp, { kind: "literal_replace" }>[],
    range: { start: number; end: number },
): OutLine[] {
    const lines = snap.lines;
    const lineStart: number[] = [];
    let off = 0;
    for (const l of lines) { lineStart.push(off); off += l.text.length + 1; }
    const regionFrom = lineStart[range.start - 1] ?? snap.text.length;
    const lastIdx = Math.max(range.start - 1, range.end - 1);
    const regionTo = range.end >= range.start ? (lineStart[lastIdx] ?? snap.text.length) + (lines[lastIdx]?.text.length ?? 0) : regionFrom;
    const region = snap.text.slice(regionFrom, regionTo);

    const edits: { start: number; end: number; replacement: string }[] = [];
    ops.forEach((op, i) => {
        const old = op.old.replaceAll("\r\n", "\n");
        if (!old) throw invalid(`edits[${i}].oldText is empty`);
        const replacement = op.replacement.replaceAll("\r\n", "\n");
        if (old === replacement) throw invalid(`edits[${i}] replaces text with itself`);
        const matches: number[] = [];
        for (let from = 0; from <= region.length - old.length;) {
            const at = region.indexOf(old, from);
            if (at < 0) break;
            matches.push(at);
            from = at + old.length;
        }
        const where = range.start === 1 && range.end >= lines.length ? "" : ` in the lines that were read (${range.start}-${range.end})`;
        if (op.all ? matches.length === 0 : matches.length !== 1) {
            throw invalid(`edits[${i}]: replace requires ${op.all ? "at least" : "exactly"} one match${where}, found ${matches.length}`);
        }
        for (const m of op.all ? matches : matches.slice(0, 1)) {
            edits.push({ start: regionFrom + m, end: regionFrom + m + old.length, replacement });
        }
    });
    edits.sort((a, b) => a.start - b.start);
    for (let i = 1; i < edits.length; i++) {
        if (edits[i]!.start < edits[i - 1]!.end) throw invalid("overlap conflict between literal replacements");
    }

    const lineOf = (offset: number) => {
        let lo = 0, hi = lineStart.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid]! <= offset) lo = mid; else hi = mid - 1; }
        return lo;
    };
    // Group edits into spans of whole lines.
    type Group = { first: number; last: number; edits: typeof edits };
    const groups: Group[] = [];
    for (const e of edits) {
        const first = lineOf(e.start);
        // A match that ends with a line break also consumes the next line's start.
        const lastEff = snap.text[e.end - 1] === "\n" ? lineOf(e.end) : lineOf(e.end - 1);
        const g = groups[groups.length - 1];
        if (g && first <= g.last) { g.last = Math.max(g.last, lastEff); g.edits.push(e); }
        else groups.push({ first, last: lastEff, edits: [e] });
    }
    const out: OutLine[] = [];
    let next = 0;
    for (const g of groups) {
        for (; next < g.first; next++) out.push(lines[next]!);
        const spanFrom = lineStart[g.first]!;
        let text = lines.slice(g.first, g.last + 1).map(l => l.text).join("\n");
        for (const e of [...g.edits].reverse()) {
            text = text.slice(0, e.start - spanFrom) + e.replacement + text.slice(e.end - spanFrom);
        }
        const parts = text.split("\n");
        const tailEol = lines[g.last]!.eol;
        parts.forEach((t, i) => out.push({ text: t, eol: i === parts.length - 1 ? tailEol : null }));
        next = g.last + 1;
    }
    for (; next < lines.length; next++) out.push(lines[next]!);
    return out;
}

type PlannedOp =
    | { kind: "insert_before" | "insert_after"; index: number; lines: string[]; order: number }
    | { kind: "delete" | "replace"; start: number; end: number; lines?: string[]; order: number };

function applyAnchored(
    ctx: Context,
    snap: types.files.FileSnapshot,
    ops: types.files.EditHashlineOp[],
    range: { start: number; end: number },
    receipt: types.files.Receipt | undefined,
): OutLine[] {
    const base = snap.lines;
    const hadTrailingNl = snap.finalNewline;
    const realCount = hadTrailingNl ? base.length - 1 : base.length;
    const check = (anchor: string): number => {
        const { line, hash } = ctx.fns.files.parseAnchor({ anchor });
        const actual = base[line - 1];
        if (actual == null) throw invalid(`anchor out of range: ${anchor}`);
        if (line < range.start || line > range.end) {
            throw invalid(`anchor ${anchor} is outside the lines that were read (${range.start}-${range.end}) — read that range first`);
        }
        const actualHash = ctx.fns.files.lineHash({ line, text: actual.text });
        if (actualHash !== hash) {
            throw invalid(`stale anchor ${anchor}: expected ${hash}, got ${actualHash} on line ${line}`);
        }
        return line;
    };
    const edge = (which: "BOF" | "EOF") => {
        if (!receipt) return;
        if (which === "BOF" && receipt.start > 1) throw invalid("BOF needs a read that starts at line 1");
        if (which === "EOF" && receipt.end < receipt.totalLines) throw invalid("EOF needs a read that reaches the last line");
    };
    const lastReal = Math.max(0, realCount - 1);
    const planned: PlannedOp[] = ops.map((op, order) => {
        if (op.kind === "insert_after" || op.kind === "insert_before") {
            const lines = op.lines.map(l => l.replace(/\r$/, ""));
            if (op.anchor === "BOF") { edge("BOF"); return { kind: "insert_before", index: 0, lines, order }; }
            if (op.anchor === "EOF") { edge("EOF"); return { kind: "insert_after", index: lastReal, lines, order }; }
            const index = check(op.anchor) - 1;
            return { kind: op.kind, index, lines, order };
        }
        if (op.kind === "delete" || op.kind === "replace") {
            const start = check(op.start) - 1;
            const end = (op.end ? check(op.end) : start + 1) - 1;
            if (end < start) throw invalid(`endAnchor ${op.end} comes before anchor ${op.start}`);
            return op.kind === "replace"
                ? { kind: "replace", start, end, lines: op.lines.map(l => l.replace(/\r$/, "")), order }
                : { kind: "delete", start, end, order };
        }
        throw invalid(`unknown edit op: ${(op as any).kind}`);
    });

    const ranged = planned.filter((x): x is Extract<PlannedOp, { start: number; end: number }> => "start" in x);
    for (let i = 0; i < ranged.length; i++) {
        for (let j = i + 1; j < ranged.length; j++) {
            const a = ranged[i]!, b = ranged[j]!;
            if (a.start <= b.end && b.start <= a.end) {
                throw invalid(`overlap conflict between ops at base ranges ${a.start + 1}-${a.end + 1} and ${b.start + 1}-${b.end + 1}`);
            }
        }
    }

    const insertsByIndex = new Map<number, { before: string[][]; after: string[][] }>();
    for (const op of planned) {
        if (!("index" in op)) continue;
        const bucket = insertsByIndex.get(op.index) ?? { before: [], after: [] };
        if (op.kind === "insert_before") bucket.before.push(op.lines);
        else bucket.after.push(op.lines);
        insertsByIndex.set(op.index, bucket);
    }
    const replaceByStart = new Map<number, Extract<PlannedOp, { start: number }>>();
    for (const op of ranged) replaceByStart.set(op.start, op);

    // An empty file is one empty line in the snapshot; treat it as no lines.
    const effective = base.length === 1 && base[0]!.text === "" ? [] : base;
    const out: OutLine[] = [];
    const pushNew = (groups: string[][]) => { for (const g of groups) for (const t of g) out.push({ text: t, eol: null }); };
    for (let i = 0; i <= effective.length; i++) {
        const at = insertsByIndex.get(i);
        if (at) pushNew(at.before);
        if (i === effective.length) {
            if (at) pushNew(at.after);
            break;
        }
        const r = replaceByStart.get(i);
        if (r) {
            const tailEol = effective[r.end]!.eol;
            if (r.kind === "replace") {
                const ls = r.lines ?? [];
                ls.forEach((t, k) => out.push({ text: t, eol: k === ls.length - 1 ? tailEol : null }));
            }
            if (at) pushNew(at.after);
            i = r.end;
            continue;
        }
        out.push(effective[i]!);
        if (at) pushNew(at.after);
    }
    return out;
}
