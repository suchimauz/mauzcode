/**
 * Creates an error whose message websearch.search may show to callers, for use inside provider handlers.
 *
 * Provider handlers throw the returned error for fixed, secret-free failures (`rate limited`, `HTTP 503`).
 * Websearch core passes only such errors through, prefixed with `websearch.search: <id>: ` and cut to
 * 200 characters; any other thrown value becomes `request failed`. Never put URLs, keys or response bodies here.
 * @param opts.message Short fixed failure message without URLs, keys or response bodies.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Short fixed failure message without URLs, keys or response bodies. */
        message: string;
    },
): Error {
    const error = new Error(String(opts?.message ?? '').slice(0, 200) || 'request failed');
    error.name = 'WebsearchProviderError';
    return error;
}
