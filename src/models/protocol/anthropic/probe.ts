/**
 * Send one minimal non-streaming `anthropic` generation (POST /messages with max_tokens 1) to check that an endpoint accepts a model.
 *
 * Use through the protocol object from models.protocol.get. Rejects an empty model with "A test model is required" before any request; sends only through the given fetch with the endpoint headers plus Content-Type application/json; fails with "Generation probe failed (HTTP n)" without exposing the body and always cancels the response body.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Transport-bound fetch of the connection. */
        fetch: types.models.ResolvedConnection["fetch"];
        /** Provider-built versioned base and headers. */
        endpoint: types.models.ProtocolEndpoint;
        /** Required provider-native model id to probe. */
        model: string;
        /** Optional cancellation signal passed to fetch. */
        signal?: AbortSignal;
    },
): Promise<void> {
    const model = opts.model;
    if (typeof model !== "string" || !model.trim()) throw new Error("A test model is required");
    const response = await ctx.fns.models.protocol.common.checkedFetch({
        fetch: opts.fetch, url: opts.endpoint.base + "/messages",
        init: { method: "POST", headers: { ...opts.endpoint.headers, "content-type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }], max_tokens: 1, stream: false }) },
        what: "Generation probe", signal: opts.signal,
    });
    await response.body?.cancel().catch(() => undefined);
}
