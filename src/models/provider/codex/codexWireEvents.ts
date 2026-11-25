/**
 * Decode Codex server-sent JSON events with malformed-event and interruption safeguards.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** body input used by the codex events protocol helper. */
        body: ReadableStream<Uint8Array>;
        /** signal input used by the codex events protocol helper. */
        signal?: AbortSignal;
    },
): AsyncGenerator<Record<string, any>> {
    const { body, signal } = opts;
    async function* iterate(): AsyncGenerator<Record<string, any>> {
        try {
            for await (const { data } of ctx.fns.models.transport.parseSSE({ body })) {
                if (!data || data === "[DONE]") continue;
                let ev: unknown;
                try { ev = JSON.parse(data); } catch {
                    const diagnostic = ctx.fns.models.inference.providerDiagnostic({ provider: 'codex', stage: 'stream' });
                    throw ctx.fns.models.inference.failure({ message: diagnostic.summary, status: 502, info: { diagnostic, code: "PROVIDER_ERROR", classification: "provider", acceptance: "uncertain", retryable: false, replaySafe: false } });
                }
                if (ev && typeof ev === "object") yield ev as Record<string, any>;
            }
        } catch (error) {
            throw ctx.fns.models.provider.codex.codexWireInterrupted({ error: error, signal: signal });
        }
    }
    return iterate();
}
