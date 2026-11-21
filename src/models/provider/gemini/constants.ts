/**
 * Provide the Gemini Code Assist OAuth endpoints, public client identity, API base and dated model list
 *
 * Use inside the gemini provider for every URL, identity value and model id, so a Google-side change is a one-line fix. Values mirror Gemini CLI (`packages/core/src/code_assist`): its public installed-app OAuth client (the client secret is public by design for installed apps), the `cloud-platform`/`userinfo.email`/`userinfo.profile` scopes, the `codeassist.google.com/authcode` paste-code redirect, the `cloudcode-pa.googleapis.com` `v1internal` API, a pinned CLI version for the User-Agent and the `skip_thought_signature_validator` placeholder. `models` is a dated list from Gemini CLI `config/models.ts` (`VALID_GEMINI_MODELS`, without `-customtools` variants). Contains no user secrets.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): {
    clientId: string; clientSecret: string; scopes: string[]; authorizeUrl: string; tokenUrl: string; revokeUrl: string; userinfoUrl: string;
    pasteRedirectUri: string; callbackPath: string; apiBase: string; apiVersion: string; cliVersion: string; refreshMarginMs: number;
    loginTtlMs: number; setupTimeoutMs: number; setupPollMs: number; placeholderSignature: string; modelsVersion: string;
    models: { id: string; label: string; family: "2.5" | "3"; variant: "pro" | "flash" | "flash-lite"; imageInput: boolean }[];
} {
    const _ctx = ctx;
    return {
        clientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
        clientSecret: "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",
        scopes: ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"],
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        revokeUrl: "https://oauth2.googleapis.com/revoke",
        userinfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
        pasteRedirectUri: "https://codeassist.google.com/authcode",
        callbackPath: "/oauth2callback",
        apiBase: "https://cloudcode-pa.googleapis.com",
        apiVersion: "v1internal",
        cliVersion: "0.34.0",
        refreshMarginMs: 60_000,
        loginTtlMs: 600_000,
        setupTimeoutMs: 120_000,
        setupPollMs: 5_000,
        placeholderSignature: "skip_thought_signature_validator",
        modelsVersion: "2026-05",
        models: [
            { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)", family: "3", variant: "pro", imageInput: true },
            { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (preview)", family: "3", variant: "pro", imageInput: true },
            { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (preview)", family: "3", variant: "flash", imageInput: true },
            { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", family: "2.5", variant: "pro", imageInput: true },
            { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", family: "2.5", variant: "flash", imageInput: true },
            { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", family: "2.5", variant: "flash-lite", imageInput: true },
        ],
    };
}
