/**
 * Build authenticated Claude subscription headers and CLI identity.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** conn input used by the claude headers protocol helper. */
        conn: types.models.ResolvedConnection;
        /** compact input used by the claude headers protocol helper. */
        compact?: boolean;
        /** usage input used by the claude headers protocol helper. */
        usage?: boolean;
    },
): Promise<Record<string, string>> {
    const { conn, compact = false, usage = false } = opts;
    
        const auth = await ctx.fns.models.provider.claude.claudeAuth({ conn, op: "token" });
        const version = typeof conn.config.clientVersion === "string" && conn.config.clientVersion.trim() || await ctx.fns.llm.claudeCodeCliVersion({});
        const h: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${auth.accessToken}`, "user-agent": ctx.env.CLAUDE_CODE_USER_AGENT ?? `claude-cli/${version} (external, sdk-cli)` };
        if (!usage) Object.assign(h, { "anthropic-version": "2023-06-01", "anthropic-beta": compact ? "claude-code-20250219,oauth-2025-04-20,compact-2026-09-04" : ctx.env.CLAUDE_CODE_ANTHROPIC_BETA ?? "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14", "x-app": "cli", "anthropic-dangerous-direct-browser-access": "true", "x-client-request-id": crypto.randomUUID() });
        return h;
}
