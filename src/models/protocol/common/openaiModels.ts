/**
 * Read an OpenAI-style model catalogue (`data[].id`) from a successful response.
 *
 * Use from the openai-chat, openai-responses and anthropic listModels procedures. Consumes the body; invalid JSON, a null payload or a missing/non-array `data` throws exactly "Invalid model catalogue" without parser messages or response content; skips non-object elements and non-string or empty ids; de-duplicates in catalogue order. Rejects and releases the body when the signal aborts.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Successful catalogue response whose body is consumed. */
        response: Response;
        /** Optional cancellation signal checked after reading. */
        signal?: AbortSignal;
    },
): Promise<types.models.ModelInfo[]> {
    let text: string;
    try { text = await opts.response.text(); }
    catch {
        opts.signal?.throwIfAborted();
        throw new Error("Invalid model catalogue");
    }
    opts.signal?.throwIfAborted();
    let payload: unknown;
    try { payload = JSON.parse(text); }
    catch { throw new Error("Invalid model catalogue"); }
    const rows = payload && typeof payload === "object" ? (payload as { data?: unknown }).data : undefined;
    if (!Array.isArray(rows)) throw new Error("Invalid model catalogue");
    const models: types.models.ModelInfo[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const id = (row as { id?: unknown }).id;
        if (typeof id !== "string" || !id || seen.has(id)) continue;
        seen.add(id);
        models.push({ id });
    }
    return models;
}
