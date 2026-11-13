/**
 * Split a Server-Sent-Events byte stream into frames
 *
 * SDK-owned SSE framing for provider streams: yields { event, data } per blank-line-delimited frame (multi-line data joined by newline, one leading space stripped, comment/keepalive frames skipped, CRLF accepted). An unterminated trailing frame is dropped as truncated. Throws when no chunk arrives within idleTimeoutMs. Callers JSON-parse and dispatch themselves.
 * @param opts.body Response byte stream.
 * @param opts.idleTimeoutMs Maximum wait between chunks in milliseconds. @default 120000 @minimum 1
 */
export default async function* (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Response byte stream. */
        body: ReadableStream<Uint8Array>;
        /** Maximum wait between chunks in milliseconds. @default 120000 @minimum 1 */
        idleTimeoutMs?: number;
    },
): AsyncGenerator<{ event: string | null; data: string }> {
    yield* _ctx.fns.models.transport.parseSSE(opts);
}
