/**
 * Validate SDK inference input before any provider network request
 *
 * Used by models.stream and models.compact after the enabled checks: fails CANCELLED for an already aborted signal; UNSUPPORTED when checkpoint entries or continuation state reach a provider that does not declare capabilities.checkpoints / continuationState; INVALID_INPUT for a malformed checkpoint, state without runId, or state/checkpoint bound to another provider, connection, session, run or model. Messages never echo opaque payloads.
 * @param opts.provider Registered provider id of the connection.
 * @param opts.connectionId Connection UUID.
 * @param opts.model Provider-native model id.
 * @param opts.sessionId Session correlation id.
 * @param opts.capabilities Provider capability opt-ins.
 * @param opts.messages Ordered input to inspect for checkpoint entries.
 * @param opts.runId Logical run id, when any.
 * @param opts.state Submitted continuation state, when any.
 * @param opts.signal Cancellation signal.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Registered provider id of the connection. */
        provider: string;
        /** Connection UUID. */
        connectionId: string;
        /** Provider-native model id. */
        model: string;
        /** Session correlation id. */
        sessionId: string;
        /** Provider capability opt-ins. */
        capabilities?: types.models.ProviderDefinition["capabilities"];
        /** Ordered input to inspect for checkpoint entries. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
        /** Logical run id, when any. */
        runId?: string;
        /** Submitted continuation state, when any. */
        state?: types.models.ProviderState;
        /** Cancellation signal. */
        signal?: AbortSignal;
    },
): void {
    return ctx.fns.models.inference.checkInput(opts);
}
