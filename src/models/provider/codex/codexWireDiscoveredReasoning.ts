/** Normalize a Codex discovery list independently of its optional default. */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Raw reasoning fields from one authenticated model entry. */
        m: { supported_reasoning_levels?: unknown; default_reasoning_level?: unknown };
    },
): types.models.ModelInfo["reasoning"] | undefined {
    const { m } = opts;
    if (!Array.isArray(m.supported_reasoning_levels)) return undefined;
    const supported: types.models.ReasoningLevel[] = [];
    for (const entry of m.supported_reasoning_levels) {
        const level = ctx.fns.models.provider.codex.codexWireLevel({ v: typeof entry === "string" ? entry : entry?.effort });
        if (level && !supported.includes(level)) supported.push(level);
    }
    if (!supported.length) return undefined;
    const def = ctx.fns.models.provider.codex.codexWireLevel({ v: m.default_reasoning_level });
    return { supported, ...(def && supported.includes(def) ? { default: def } : {}) };
}
