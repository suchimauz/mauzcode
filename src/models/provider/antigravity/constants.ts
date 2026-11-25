/**
 * Provide the Antigravity OAuth client identity, endpoints, Hub User-Agent and account warning
 *
 * Use inside the antigravity provider for every URL and identity value. Values follow the reference adapter
 * opencode-antigravity-auth at revision 821f824 (`src/constants.ts`): the public installed-app client of the
 * Antigravity desktop application (its secret is not confidential by Google's installed-app rules), the scopes,
 * the fixed loopback redirect `http://localhost:51121/oauth-callback`, the daily Cloud Code host with `v1internal`
 * and the Hub User-Agent. `ANTIGRAVITY_OAUTH_CLIENT_ID` and `ANTIGRAVITY_OAUTH_CLIENT_SECRET` replace the client
 * values for this installation; empty values are ignored. Contains no account secrets and sends nothing.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): {
    clientId: string; clientSecret: string; scopes: string[]; authorizeUrl: string; tokenUrl: string; redirectUri: string;
    apiBase: string; userAgent: string; loginTtlMs: number; refreshMarginMs: number; referenceRevision: string; warning: string;
} {
    return {
        clientId: ctx.env.ANTIGRAVITY_OAUTH_CLIENT_ID || "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
        clientSecret: ctx.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || "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",
        scopes: [
            "https://www.googleapis.com/auth/cloud-platform",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/cclog",
            "https://www.googleapis.com/auth/experimentsandconfigs",
        ],
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        redirectUri: "http://localhost:51121/oauth-callback",
        apiBase: "https://daily-cloudcode-pa.googleapis.com/v1internal",
        userAgent: "antigravity/hub/2.24.0 (aidev_client; os_type=darwin; arch=arm64; cl=1000335682)",
        loginTtlMs: 600_000,
        refreshMarginMs: 60_000,
        referenceRevision: "821f824440b2b7c9ffe96bbdfad9d5cdead2f1de",
        warning: "Google's Antigravity terms disallow third-party access with a personal Antigravity login, and Google may suspend the account. Sign in only with an account whose suspension you accept.",
    };
}
