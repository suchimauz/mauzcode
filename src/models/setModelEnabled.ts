/**
 * Disable or re-enable one model id on a model connection
 *
 * Owner operation behind the Models tab model switches. Atomically adds or removes the model id in the connection's disabled set (idempotent), bumps updatedAt and emits the llm-models refresh topic. Disabled models stay listed but models.stream and models.compact refuse them. Does not touch legacy llm.modelPolicy routes. Fails with VALIDATION for an empty, whitespace-containing or over-200-character model id and NOT_FOUND for an unknown connection.
 * @param opts.id Connection UUID.
 * @param opts.model Provider-native model id, 1–200 characters without whitespace.
 * @param opts.enabled True re-enables the model, false disables it.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Provider-native model id, 1–200 characters without whitespace. */
        model: string;
        /** True re-enables the model, false disables it. */
        enabled: boolean;
    },
): Promise<types.models.ConnectionView> {
    return ctx.fns.models.catalog.setModelEnabled(opts);
}
