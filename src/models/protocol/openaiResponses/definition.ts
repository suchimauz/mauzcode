/**
 * Return the shared `openai-responses` wire protocol strategy (OpenAI Responses).
 *
 * Use through models.protocol.get rather than directly. Keeps the normalized base unchanged and authenticates with a bearer Authorization header. The returned object holds no captured state.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): types.models.Protocol {
    return {
        id: "openai-responses",
        label: "OpenAI Responses",
        baseUrl(ctx, raw) {
            const base = ctx.fns.models.protocol.common.normalizeBase({ raw });
            return base;
        },
        defaultHeaders() { return ({}); },
        apiKeyHeaders(key) { return ({ authorization: "Bearer " + key }); },
        listModels(ctx, opts) { return ctx.fns.models.protocol.openaiResponses.listModels(opts); },
        probe(ctx, opts) { return ctx.fns.models.protocol.openaiResponses.probe(opts); },
        stream(ctx, opts) { return ctx.fns.models.protocol.openaiResponses.stream(opts); },
    };
}
