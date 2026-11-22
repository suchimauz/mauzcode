type Auth = Readonly<{ token: string; accountId: string | null; generation: string | null; credentialRevision: number }>;

/**
 * Resolve Codex access token and account identity from scoped authorization.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** conn input used by the codex auth protocol helper. */
        conn: types.models.ResolvedConnection;
    },
): Promise<Auth> {

    const { conn } = opts;
    
        const r = await ctx.fns.models.provider.codex.codexAuth({ conn, op: "token" });
        return Object.freeze({ token: r.accessToken!, accountId: r.accountId, generation: r.generation, credentialRevision: r.credentialRevision });
}
