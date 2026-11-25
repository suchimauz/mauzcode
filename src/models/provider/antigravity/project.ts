/**
 * Resolve the signed-in Antigravity account's Cloud Code project
 *
 * Returns the project cached with the grant, otherwise asks `loadCodeAssist` (metadata ideType ANTIGRAVITY) through
 * the connection transport and caches `cloudaicompanionProject` (string or `{ id }`) for this grant. A response
 * without a project fails PROJECT_UNAVAILABLE; access denial fails ACCESS_DENIED. Never onboards, invents or borrows
 * a project. A new login or logout forgets the cached project.
 * @param opts.conn Resolved antigravity connection.
 * @param opts.signal Optional cancellation signal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection. */
        conn: types.models.ResolvedConnection;
        /** Optional cancellation signal. */
        signal?: AbortSignal;
    },
): Promise<string> {
    const { conn } = opts;
    const state = await ctx.fns.models.provider.antigravity.auth({ conn, op: "token" });
    if (state.projectId) return state.projectId;
    const body = await ctx.fns.models.provider.antigravity.api({ conn, method: "loadCodeAssist", body: { metadata: { ideType: "ANTIGRAVITY" } }, signal: opts.signal });
    const raw = body.cloudaicompanionProject;
    const id = typeof raw === "string" ? raw.trim() : raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "string" ? String((raw as { id: string }).id).trim() : "";
    if (!id) throw ctx.fns.models.inference.failure({ message: "This Antigravity account has no accessible project", status: 403, info: { code: "PROJECT_UNAVAILABLE", classification: "auth", acceptance: "rejected", retryable: false, replaySafe: true } });
    await ctx.fns.models.provider.antigravity.auth({ conn, op: "project", projectId: id });
    return id;
}
