/**
 * Create a native compaction checkpoint through a model connection's provider
 *
 * Compaction entry point of the models stack. Applies the same per-call enabled checks as models.stream (no network request for a disabled model or connection), then calls the provider's compact operation through the connection transport. Fails UNSUPPORTED when the provider declares no compact. Validates input first (cancellation, checkpoint entries and their provider/connection/model identity) without network. Returns the opaque checkpoint item callers must persist verbatim and, for providers declaring capabilities.checkpoints, a portable `checkpoint` envelope to replay as a CheckpointEntry.
 * @param opts.connectionId Model connection UUID.
 * @param opts.model Provider-native model id on the connection.
 * @param opts.instructions Effective system instructions.
 * @param opts.messages Ordered transcript; checkpoint entries allowed for checkpoint-capable providers.
 * @param opts.focus Optional handoff guidance identifying what context to preserve.
 * @param opts.maxTokens Provider output token budget for compaction. @minimum 1
 * @param opts.sessionId Stable session or agent id for caching and correlation.
 * @param opts.signal Cancels the provider request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model connection UUID. */
        connectionId: string;
        /** Provider-native model id on the connection. */
        model: string;
        /** Effective system instructions. */
        instructions: string;
        /** Ordered transcript; checkpoint entries allowed for checkpoint-capable providers. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
        /** Optional handoff guidance identifying what context to preserve. */
        focus?: string;
        /** Provider output token budget for compaction. @minimum 1 */
        maxTokens?: number;
        /** Stable session or agent id for caching and correlation. */
        sessionId: string;
        /** Cancels the provider request. */
        signal?: AbortSignal;
    },
): Promise<types.models.CompactResult> {
    return ctx.fns.models.inference.compact(opts);
}
