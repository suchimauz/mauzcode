/**
 * Report the secret-free effective client version for one model connection
 *
 * Calls the optional provider hook without fetching credentials or making network requests. Providers without the hook return null. Validates and projects the report, never returning extra provider fields.
 * @param opts.id Connection UUID.
 * @param opts.refresh Discard the provider's local CLI detection cache. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Discard the provider's local CLI detection cache. @default false */
        refresh?: boolean;
    },
): Promise<{ clientVersion: { version: string; source: string; detail?: string } | null }> {
    const { definition, conn } = await ctx.fns.models.connections.resolve({ id: opts.id });
    if (!definition.clientVersion) return { clientVersion: null };
    // Identity reporting never needs credentials or transport access.
    conn.secret = async () => null;
    conn.fetch = async () => { throw new Error("Client version reporting cannot use the network"); };
    const result = await definition.clientVersion(ctx, conn, { refresh: opts.refresh === true });
    if (!result || typeof result.version !== "string" || !/^[0-9A-Za-z.+-]{1,40}$/.test(result.version)
        || !["override", "detected", "fallback", "default"].includes(result.source)
        || (result.detail !== undefined && (typeof result.detail !== "string" || result.detail.length > 200
            || /[\r\n]|(?:secret|op|env):\/\/|bearer\s|token[=:]/i.test(result.detail)))) {
        throw new Error("Provider returned an invalid client version report");
    }
    return { clientVersion: { version: result.version, source: result.source, ...(result.detail !== undefined ? { detail: result.detail } : {}) } };
}
