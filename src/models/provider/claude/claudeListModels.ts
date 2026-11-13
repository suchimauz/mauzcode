/**
 * List provider model identifiers and preserve discovery fallback semantics.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<types.models.ModelInfo[]> {
    const MODELS = ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-sonnet-4-6", "claude-sonnet-5", "claude-opus-4-5", "claude-opus-4-6", "claude-opus-4-8", "claude-opus-5", "claude-opus-5-5"];
     return MODELS.map(id => ({ id }));
}
