/**
 * Normalize Codex reasoning level names and reject unsupported values.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** v input used by the codex level protocol helper. */
        v: unknown;
    },
): types.models.ReasoningLevel | null {
    const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
    const { v } = opts;
    
        const s = v === "none" ? "off" : v;
        return typeof s === "string" && (LEVELS as readonly string[]).includes(s) ? s as types.models.ReasoningLevel : null;
}
