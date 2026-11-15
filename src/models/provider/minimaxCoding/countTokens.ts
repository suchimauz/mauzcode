/**
 * Count input tokens exactly through the MiniMax count_tokens endpoint
 *
 * The SDK countTokens of the minimax-coding provider, reached through models.countTokens when fresh provider usage is missing and the local estimate is not enough. Builds the same conversion as an inference request — toAnthropicMessages (including stored signed reasoning blocks from the same connection and model, because MiniMax counts them as input) plus toTools and the instructions as system — and POSTs it to https://api.minimax.io/anthropic/v1/messages/count_tokens through the connection's transport with the x-api-key header. No generation happens upstream. Fails without throwing secrets or body text on any HTTP or parse failure; models.countTokens turns every failure into null so callers keep their local estimate.
 * @param opts.conn Resolved minimax-coding connection supplying the apiKey secret and transport-bound fetch.
 * @param opts.model M Plan model id to count for.
 * @param opts.messages Ordered input in the same shape streaming accepts.
 * @param opts.instructions Effective system instructions, sent as system. @default ""
 * @param opts.tools Provider-neutral tools, sent as Anthropic tool declarations. @default []
 * @param opts.timeoutMs Request deadline in milliseconds. @default 10000 @minimum 1 @maximum 10000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved minimax-coding connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
        /** M Plan model id to count for. */
        model: string;
        /** Ordered input in the same shape streaming accepts. */
        messages: (Record<string, unknown> | types.models.CheckpointEntry)[];
        /** Effective system instructions, sent as system. @default "" */
        instructions?: string;
        /** Provider-neutral tools, sent as Anthropic tool declarations. @default [] */
        tools?: types.models.ToolSpec[];
        /** Request deadline in milliseconds. @default 10000 @minimum 1 @maximum 10000 */
        timeoutMs?: number;
    },
): Promise<number> {
    const timeout = Math.min(Math.max(opts.timeoutMs ?? 10000, 1), 10000);
    const headers = await ctx.fns.models.provider.minimaxCoding.headers({ conn: opts.conn });
    const system = [opts.instructions ?? ""].filter(Boolean).join("\n\n");
    const messages = ctx.fns.models.protocol.anthropic.toAnthropicMessages({
        messages: opts.messages, replayReasoning: true, origin: { connectionId: opts.conn.id, model: opts.model },
    });
    const body: Record<string, unknown> = {
        model: opts.model, messages,
        ...(system ? { system } : {}),
        ...(opts.tools?.length ? { tools: ctx.fns.models.protocol.anthropic.toTools({ tools: opts.tools }) } : {}),
    };
    const res = await opts.conn.fetch("https://api.minimax.io/anthropic/v1/messages/count_tokens", {
        method: "POST", headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error("MiniMax token counting failed (HTTP " + res.status + ")");
    }
    const parsed = await res.json().catch(() => null) as { input_tokens?: unknown } | null;
    const count = Number(parsed?.input_tokens);
    if (!Number.isFinite(count) || count < 0) throw new Error("Unrecognized MiniMax token count response");
    return count;
}
