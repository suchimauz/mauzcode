type CodexAuthRecord = { idToken: string; accessToken: string; refreshToken: string; accountId: string; expiresAt: number; needsLogin: boolean };
/**
 * Read, store, refresh or clear a Codex connection's encrypted OAuth tokens
 *
 * Token store of the built-in codex model provider. Keeps one encrypted local secret per connection (namespace models, `<id>.codex-auth`) with compare-and-swap revisions. op `status` returns login state; `token` returns a valid access token, refreshing it through conn.fetch (the connection transport) when it expires within 60 s, with one shared refresh per connection and stale-revision protection; `store` saves tokens from a completed login; `markLogin` flags the connection as requiring login (after a 401 or a rejected refresh); `clear` deletes the tokens without network access (logout). Throws code LOGIN_REQUIRED when no usable login exists. Only `token` returns a credential, and callers must never return or log it.
 * @param opts.conn Resolved codex connection; its fetch is the only network path.
 * @param opts.op Operation to perform.
 * @param opts.tokens OAuth token response to persist; required for op store.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved codex connection; its fetch is the only network path. */
        conn: types.models.ResolvedConnection;
        /** Operation to perform. */
        op: "status" | "token" | "store" | "markLogin" | "clear";
        /** OAuth token response to persist; required for op store. */
        tokens?: { id_token?: string; access_token: string; refresh_token?: string };
    },
): Promise<{ loggedIn: boolean; needsLogin: boolean; accountId: string | null; expiresAt: number | null; accessToken?: string }> {
    return ctx.fns.models.provider.codex.codexAuth(opts);
}
