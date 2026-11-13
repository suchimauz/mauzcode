/**
 * Discover models of a `gemini` endpoint with GET <base>/models.
 *
 * Use through the protocol object from models.protocol.get. Sends only through the given transport-bound fetch with the provider-built endpoint headers; returns unique non-empty `models[].name` ids without the `models/` prefix in catalogue order (displayName is ignored); fails with "Model discovery request failed (HTTP n)" or exactly "Invalid model catalogue" without exposing response content and always releases the body.
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
    let text: string;
    try { text = await response.text(); }
    catch {
        opts.signal?.throwIfAborted();
        throw new Error("Invalid model catalogue");
    }
    opts.signal?.throwIfAborted();
    let payload: unknown;
    try { payload = JSON.parse(text); }
    catch { throw new Error("Invalid model catalogue"); }
    const rows = payload && typeof payload === "object" ? (payload as { models?: unknown }).models : undefined;
    if (!Array.isArray(rows)) throw new Error("Invalid model catalogue");
    const models: types.models.ModelInfo[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const name = (row as { name?: unknown }).name;
        if (typeof name !== "string") continue;
        const id = name.replace(/^models\//, "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        models.push({ id });
    }
    return models;
}
