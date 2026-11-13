/**
 * Build the provider-facing ResolvedConnection for one stored connection
 *
 * Internal step before calling provider test/listModels/usage/actions. Exposes only this connection's non-secret config, a lazy `secret(key)` reader limited to its own declared secret fields, and `fetch` bound to its saved transport (no direct fallback). Throws `NOT_FOUND` for unknown connections and `UNKNOWN_PROVIDER` when the provider is not registered. Never returns or logs secret values itself.
 * @param opts.id Connection UUID.
 * @param opts.signal Cancellation applied to every request made through the resolved fetch.
 * @param opts.timeoutMs Deadline for each request made through the resolved fetch. @default 30000 @minimum 1 @maximum 3600000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Cancellation applied to every request made through the resolved fetch. */
        signal?: AbortSignal;
        /** Deadline for each request made through the resolved fetch. @default 30000 @minimum 1 @maximum 3600000 */
        timeoutMs?: number;
    },
): Promise<{ view: types.models.ConnectionView; definition: types.models.ProviderDefinition; conn: types.models.ResolvedConnection }> {
    return ctx.fns.models.connections.resolve(opts);
}
