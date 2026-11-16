/**
 * Provide the Qwen subscription OAuth endpoints, client identity and gateway base
 *
 * Use inside the qwen provider for every URL and identity value, so a Qwen-side change is a one-line fix. Values mirror Qwen Code's subscription client (`qwen-code-cli`, scope `model:invoke profile:read`, no PKCE); the gateway is OpenAI Chat Completions compatible. Contains no secrets.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): { authBase: string; deviceCodeUrl: string; tokenUrl: string; revokeUrl: string; userinfoUrl: string; authorizeUrl: string; clientId: string; scope: string; apiBase: string; userAgent: string; refreshMarginMs: number } {
    const _ctx = ctx;
    const authBase = "https://auth.qwen.ai";
    return {
        authBase,
        deviceCodeUrl: authBase + "/api/oauth/device/code",
        tokenUrl: authBase + "/api/oauth/token",
        revokeUrl: authBase + "/api/oauth/revoke",
        userinfoUrl: authBase + "/api/oauth/userinfo",
        authorizeUrl: "https://chat.qwen.ai/authorize",
        clientId: "qwen-code-cli",
        scope: "model:invoke profile:read",
        apiBase: "https://api.qwen.ai/compatible-mode/v1",
        userAgent: "MauzCode",
        refreshMarginMs: 30_000,
    };
}
