/**
 * Provide the Claude subscription OAuth endpoints and client identity
 *
 * Use inside models for provider wire compatibility without the legacy runtime. Preserves existing transcript, authentication or client identity behavior.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): { clientId: string; authorizeUrl: string; tokenUrl: string; redirectUri: string; scopes: string } {
    return {
            clientId: ctx.env.ANTHROPIC_OAUTH_CLIENT_ID ?? "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
            authorizeUrl: ctx.env.ANTHROPIC_OAUTH_AUTHORIZE_URL ?? "https://claude.ai/oauth/authorize",
            tokenUrl: ctx.env.ANTHROPIC_OAUTH_TOKEN_URL ?? "https://platform.claude.com/v1/oauth/token",
            redirectUri: ctx.env.ANTHROPIC_OAUTH_REDIRECT_URI ?? "http://localhost:53692/callback",
            scopes: "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload",
        };
}
