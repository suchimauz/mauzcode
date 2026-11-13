/**
 * Return the shared `gemini` wire protocol strategy (Gemini).
 *
 * Use through models.protocol.get rather than directly. Appends /v1beta unless the base already ends with /v1 or /v1beta and authenticates with x-goog-api-key. The returned object holds no captured state.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): types.models.Protocol {
    return {
        id: "gemini",
        label: "Gemini",
        baseUrl(ctx, raw) {
            const base = ctx.fns.models.protocol.common.normalizeBase({ raw });
            return /\/v1(?:beta)?$/.test(base) ? base : base + "/v1beta";
        },
        defaultHeaders() { return ({}); },
        apiKeyHeaders(key) { return ({ "x-goog-api-key": key }); },
        listModels(ctx, opts) { return ctx.fns.models.protocol.gemini.listModels(opts); },
        probe(ctx, opts) { return ctx.fns.models.protocol.gemini.probe(opts); },
    };
}
