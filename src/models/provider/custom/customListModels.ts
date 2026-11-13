/**
 * List provider model identifiers and preserve discovery fallback semantics.
 *
 * Use from custom provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying scoped credentials and transport. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.ModelInfo[]> {
    const { conn } = opts;
    
    
            // Let core listModels supply the manual fallback and safe discovery error flag.
            const discovered = await ctx.fns.models.provider.custom.customProtocol({ conn, operation: "models" });
            const ids = new Set(discovered.map(model => model.id));
            for (const id of Array.isArray(conn.config.models) ? conn.config.models : []) {
                if (id && !ids.has(id)) { ids.add(id); discovered.push({ id }); }
            }
            return discovered;
}
