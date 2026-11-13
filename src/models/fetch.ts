/**
 * Fetch a response through an explicit model transport
 *
 * Use for ResolvedConnection.fetch. Refuse redirects, credentials and non-HTTPS proxy destinations; never fall back. Deadline and cancellation cover setup and streamed bodies. Proxy requests support GET/POST and eight MiB bodies. Connection-id resolution belongs to the later connection layer.
 * @param opts.transport Saved transport bound to this connection.
 * @param opts.url Absolute credential-free HTTP(S) destination.
 * @param opts.init Request options; redirects always fail and proxy methods must be GET or POST.
 * @param opts.signal Cancellation combined with init.signal through body EOF.
 * @param opts.timeoutMs Total deadline including setup and body streaming. @default 120000 @minimum 1 @maximum 3600000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Saved transport bound to this connection. */
        transport: types.models.TransportSpec;
        /** Absolute credential-free HTTP(S) destination. */
        url: string;
        /** Request options; redirects always fail and proxy methods must be GET or POST. */
        init?: RequestInit;
        /** Cancellation combined with init.signal through body EOF. */
        signal?: AbortSignal;
        /** Total deadline including setup and body streaming. @default 120000 @minimum 1 @maximum 3600000 */
        timeoutMs?: number;
    },
): Promise<Response> {
    return ctx.fns.models.transport.fetch(opts);
}
