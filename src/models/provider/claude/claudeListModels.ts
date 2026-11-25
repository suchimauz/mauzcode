/**
 * List provider model identifiers and preserve discovery fallback semantics.
 *
 * Use for the Claude connection catalogue. Reasoning metadata is derived from
 * the adapter's wire resolver; models without adaptive effort control omit it.
 * Catalogue default is medium when auto uses the provider's implicit default.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<types.models.ModelInfo[]> {
    const MODELS = ["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"];
    return Promise.all(MODELS.map(async id => {
        const automatic = await ctx.fns.models.inference.resolveReasoningEffort({ model: id, effort: 'auto' });
        if (automatic.mode === 'none') return { id };
        const levels: types.models.ReasoningLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
        const supported: types.models.ReasoningLevel[] = [];
        for (const effort of levels) {
            const resolved = await ctx.fns.models.inference.resolveReasoningEffort({ model: id, effort });
            if (!resolved.downgraded && resolved.applied === effort) supported.push(effort);
        }
        const defaultLevel = automatic.applied !== 'auto' && supported.includes(automatic.applied) ? automatic.applied : 'medium';
        return { id, reasoning: { supported, default: defaultLevel as types.models.ReasoningLevel } };
    }));
}
