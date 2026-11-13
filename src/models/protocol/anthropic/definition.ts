/**
 * Return the shared `anthropic` wire protocol strategy (Anthropic Messages).
 *
 * Use through models.protocol.get rather than directly. Appends /v1 unless the base already ends with /v1, always sends anthropic-version 2023-06-01 and authenticates with x-api-key. The returned object holds no captured state.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): types.models.Protocol {
    return {
        id: "anthropic",
        label: "Anthropic Messages",
        baseUrl(ctx, raw) {
            const base = ctx.fns.models.protocol.common.normalizeBase({ raw });
            return base.endsWith("/v1") ? base : base + "/v1";
        },
        defaultHeaders() { return ({ "anthropic-version": "2023-06-01" }); },
        apiKeyHeaders(key) { return ({ "x-api-key": key }); },
        listModels(ctx, opts) { return ctx.fns.models.protocol.anthropic.listModels(opts); },
        probe(ctx, opts) { return ctx.fns.models.protocol.anthropic.probe(opts); },
    };
}
