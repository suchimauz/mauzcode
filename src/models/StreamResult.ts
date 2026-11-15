/** Normalized streaming result; matches the legacy llm stream result shape plus additive SDK observations. */
export type StreamResult = {
    text: string;
    thinking: string;
    /** stop, length, tool_calls or null when unknown. */
    finishReason: string | null;
    /** Token counters only; quota lives in `quota`. */
    usage: { prompt_tokens?: number; completion_tokens?: number; cache_read_tokens?: number; cache_write_tokens?: number };
    /** Tool calls; unparseable arguments are `{ __unparsed: raw }` for downstream validation. */
    toolCalls: { id: string; name: string; args: unknown }[];
    /** Continuation state to pass with the next request of the same run (requires runId and provider support). */
    state?: types.models.ProviderState;
    /** Quota windows the provider reported on this response, without an extra request. */
    quota?: types.models.QuotaObservation;
    /** Requested/applied reasoning for providers opting into SDK normalization. */
    reasoning?: types.models.ReasoningResolution;
    /** Complete native reasoning blocks of an anthropic response, in order; stored on tool-call turns and replayed unchanged by the anthropic protocol only. */
    reasoningBlocks?: { type: "thinking" | "redacted_thinking"; thinking?: string; signature?: string; data?: string }[];
};
