type Auth = { token: string; accountId: string | null };

/**
 * Send Codex Responses requests with required version and session identity headers.
 *
 * Use from codex provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** conn input used by the codex responses protocol helper. */
        conn: types.models.ResolvedConnection;
        /** a input used by the codex responses protocol helper. */
        a: Auth;
        /** sessionId input used by the codex responses protocol helper. */
        sessionId: string;
        /** body input used by the codex responses protocol helper. */
        body: Record<string, unknown>;
        /** signal input used by the codex responses protocol helper. */
        signal?: AbortSignal;
        /** extra input used by the codex responses protocol helper. */
        extra?: Record<string, string>;
    },
): Promise<Response> {
    const BASE = "https://chatgpt.com/backend-api";

    const { conn, a, sessionId, body, signal, extra = {} } = opts;
    
        const headers: Record<string, string> = {
            authorization: `Bearer ${a.token}`,
            ...(a.accountId ? { "chatgpt-account-id": a.accountId } : {}),
            originator: "codex_cli_rs",
            version: ctx.fns.models.provider.codex.codexVersion({ config: conn.config }),
            "OpenAI-Beta": "responses=experimental",
            accept: "text/event-stream",
            "content-type": "application/json",
            session_id: sessionId,
            "x-client-request-id": sessionId,
            ...extra,
        };
        if (signal?.aborted) throw ctx.fns.models.failure({ message: "Request cancelled before dispatch", status: 499, info: { code: "CANCELLED", classification: "cancelled", acceptance: "none", retryable: false, replaySafe: true } });
        let res: Response;
        try {
            res = await conn.fetch(`${BASE}/codex/responses`, { method: "POST", headers, body: JSON.stringify(body), signal });
        } catch (error) {
            throw ctx.fns.models.provider.codex.codexWireInterrupted({ error: error, signal: signal });
        }
        return ctx.fns.models.provider.codex.codexWireChecked({ conn: conn, res: res });
}
