/**
 * Build the provider-facing ResolvedConnection for one stored voice connection
 *
 * Internal step before calling a provider operation. Exposes only this connection's non-secret configuration and
 * a lazy `secret(key)` reader limited to its own declared secret fields. Throws `NOT_FOUND` for unknown
 * connections and `UNKNOWN_PROVIDER` when the provider is no longer registered. Never returns, logs or stores a
 * secret value itself.
 * @param opts.id Connection UUID.
 * @param opts.signal Cancellation applied to the provider operation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Cancellation applied to the provider operation. */
        signal?: AbortSignal;
    },
): Promise<{ view: types.voice.ConnectionView; definition: types.voice.ProviderDefinition; conn: types.voice.ResolvedConnection }> {
    const view = await ctx.fns.voice.connections.get({ id: opts.id });
    const entry = Object.hasOwn(ctx.state.voice?.providers ?? {}, view.provider) ? ctx.state.voice!.providers![view.provider] : undefined;
    if (!entry) throw Object.assign(new Error(`Voice provider ${view.provider} is not registered`), { code: "UNKNOWN_PROVIDER", status: 409 });
    const definition = entry.definition;
    const secretKeys = new Set(definition.fields.filter(field => field.type === "secret").map(field => field.key));
    const conn: types.voice.ResolvedConnection = {
        id: view.id,
        provider: view.provider,
        accountName: view.accountName,
        config: structuredClone(view.config),
        secret: async (key: string) => {
            if (!secretKeys.has(key) || !view.secrets[key]) return undefined;
            return (await ctx.fns.secrets.getLocal({ namespace: "voice", name: `${view.id}.${key}` })) ?? undefined;
        },
        ...(opts.signal ? { signal: opts.signal } : {}),
    };
    return { view, definition, conn };
}
