/**
 * Count input tokens exactly through a provider that declares counting
 *
 * Public exact-counting entry point of the models stack: checks the enabled state of the connection and model, returns null without any network request when the provider declares no countTokens operation, and otherwise asks the provider's countTokens (the same request shape as streaming — messages, optional instructions and neutral tools, no generation) through the connection's transport-bound fetch within timeoutMs. Never throws: a disabled connection, unsupported provider, timeout or provider failure all return null so callers can fall back to their own estimate.
 * @param opts.connectionId Model connection UUID.
 * @param opts.model Provider-native model id on the connection.
 * @param opts.messages Ordered input in the same OpenAI-shaped shape streaming accepts; checkpoint entries only for checkpoint-capable providers.
 * @param opts.instructions Effective system instructions sent with the request.
 * @param opts.tools Provider-neutral tools advertised to the model, never executed here.
 * @param opts.timeoutMs Deadline for the whole counting request. @minimum 1 @maximum 3600000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model connection UUID. */
        connectionId: string;
        /** Provider-native model id on the connection. */
        model: string;
        /** Ordered input in the same OpenAI-shaped shape streaming accepts; checkpoint entries only for checkpoint-capable providers. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
        /** Effective system instructions sent with the request. */
        instructions?: string;
        /** Provider-neutral tools advertised to the model, never executed here. */
        tools?: types.models.ToolSpec[];
        /** Deadline for the whole counting request. @minimum 1 @maximum 3600000 */
        timeoutMs?: number;
    },
): Promise<number | null> {
    try {
        const view = await ctx.fns.models.inference.assertModelEnabled({ id: opts.connectionId, model: opts.model });
        const definition = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider)
            ? ctx.state.models!.providers![view.provider]!.definition : undefined;
        // No provider counting declared: return without any network request.
        if (!definition?.countTokens) return null;
        const signal = opts.timeoutMs !== undefined ? AbortSignal.timeout(Math.min(Math.max(opts.timeoutMs, 1), 3600000)) : undefined;
        const { conn } = await ctx.fns.models.connections.resolve({ id: view.id, ...(signal ? { signal } : {}) });
        const count = await Promise.race([
            definition.countTokens(ctx, conn, { model: opts.model, messages: opts.messages, ...(opts.instructions !== undefined ? { instructions: opts.instructions } : {}), ...(opts.tools !== undefined ? { tools: opts.tools } : {}) }),
            ...(signal ? [new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))] : []),
        ]);
        return typeof count === "number" && Number.isFinite(count) && count >= 0 ? Math.round(count) : null;
    } catch {
        // Counting is best-effort by contract: any failure is reported as null, never thrown.
        return null;
    }
}
