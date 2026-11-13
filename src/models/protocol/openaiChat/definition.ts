/**
 * Return the shared `openai-chat` wire protocol strategy (OpenAI Chat Completions).
 *
 * Use through models.protocol.get rather than directly. Keeps the normalized base unchanged and authenticates with a bearer Authorization header. The returned object holds no captured state.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): types.models.Protocol {
    return {
        id: "openai-chat",
        label: "OpenAI Chat Completions",
        baseUrl(ctx, raw) {
            const base = ctx.fns.models.protocol.common.normalizeBase({ raw });
            return base;
        },
        defaultHeaders() { return ({}); },
        apiKeyHeaders(key) { return ({ authorization: "Bearer " + key }); },
        listModels(ctx, opts) { return ctx.fns.models.protocol.openaiChat.listModels(opts); },
        probe(ctx, opts) { return ctx.fns.models.protocol.openaiChat.probe(opts); },
    };
}
