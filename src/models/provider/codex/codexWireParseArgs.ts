/**
 * Decode tool arguments while retaining incomplete JSON in the unparsed marker.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** raw input used by the codex parseArgs protocol helper. */
        raw: unknown;
    },
): unknown {
    const { raw } = opts;
    
        const buf = typeof raw === "string" ? raw : "";
        if (!buf.trim()) return {};
        try { return JSON.parse(buf); } catch { return { __unparsed: buf }; }
}
