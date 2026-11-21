/**
 * Count input tokens exactly through the Code Assist countTokens method
 *
 * The SDK countTokens of the gemini provider. Converts the transcript with the same conversion as streaming (system rows dropped, placeholder signatures on unsigned function-call turns) and puts the system instructions in front as a leading user content, because this request has no systemInstruction field. POSTs `{ request: { model: "models/<model>", contents } }` (no project or prompt id) to `v1internal:countTokens` through conn.fetch and returns the reported `totalTokens`. No generation happens. Fails without secrets or body text on any HTTP or parse failure.
 * @param opts.conn Resolved gemini connection.
 * @param opts.model Model id to count for.
 * @param opts.messages Ordered input in the same shape streaming accepts.
 * @param opts.instructions Effective system instructions. @default ""
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection. */
        conn: types.models.ResolvedConnection;
        /** Model id to count for. */
        model: string;
        /** Ordered input in the same shape streaming accepts. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
        /** Effective system instructions. @default "" */
        instructions?: string;
    },
): Promise<number> {
    const model = opts.model.replace(/^models\//, "");
    const transcript = (opts.messages as Record<string, any>[]).filter(m => m.role !== "system");
    const converted = ctx.fns.models.provider.gemini.signContents({ contents: await ctx.fns.models.protocol.gemini.toGeminiContents({ messages: transcript }) });
    const contents = opts.instructions ? [{ role: "user", parts: [{ text: opts.instructions }] }, ...converted] : converted;
    const res = await ctx.fns.models.provider.gemini.request({ conn: opts.conn, method: "countTokens", model, body: { request: { model: "models/" + model, contents } }, signal: AbortSignal.timeout(10000) });
    const parsed = await res.json().catch(() => null) as { totalTokens?: unknown } | null;
    const count = Number(parsed?.totalTokens);
    if (!Number.isFinite(count) || count < 0) throw new Error("Unrecognized Gemini token count response");
    return count;
}
