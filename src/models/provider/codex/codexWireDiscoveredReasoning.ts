/**
 * Validate complete and consistent Codex discovery reasoning metadata.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** m input used by the codex discoveredReasoning protocol helper. */
        m: { supported_reasoning_levels?: unknown; default_reasoning_level?: unknown };
    },
): types.models.ModelInfo["reasoning"] | undefined {
    const { m } = opts;
    
        if (!Array.isArray(m.supported_reasoning_levels)) return undefined;
        const supported = m.supported_reasoning_levels.map(x => ctx.fns.models.provider.codex.codexWireLevel({ v: typeof x === "string" ? x : (x as { effort?: unknown })?.effort }));
        const def = ctx.fns.models.provider.codex.codexWireLevel({ v: m.default_reasoning_level });
        if (!supported.length || supported.some(x => !x) || !def || !supported.includes(def) || new Set(supported).size !== supported.length) return undefined;
        return { supported: supported as types.models.ReasoningLevel[], default: def };
}
