/**
 * Discover models of a `openai-responses` endpoint with GET <base>/models.
 *
 * Use through the protocol object from models.protocol.get. Sends only through the given transport-bound fetch with the provider-built endpoint headers; returns unique non-empty `data[].id` values in catalogue order; fails with "Model discovery request failed (HTTP n)" or exactly "Invalid model catalogue" without exposing response content and always releases the body.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Transport-bound fetch of the connection. */
        fetch: types.models.ResolvedConnection["fetch"];
        /** Provider-built versioned base and headers. */
        endpoint: types.models.ProtocolEndpoint;
        /** Optional cancellation signal passed to fetch. */
        signal?: AbortSignal;
    },
): Promise<types.models.ModelInfo[]> {
    const response = await ctx.fns.models.protocol.common.checkedFetch({
        fetch: opts.fetch, url: opts.endpoint.base + "/models", init: { method: "GET", headers: opts.endpoint.headers },
        what: "Model discovery request", signal: opts.signal,
    });
    return ctx.fns.models.protocol.common.openaiModels({ response, signal: opts.signal });
}
