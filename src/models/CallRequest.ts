/** One-shot request accepted by models.call: a single user prompt to one enabled model of a stored connection. */
export type CallRequest = {
    /** Model connection UUID. */
    connectionId: string;
    /** Provider-native model id on the connection. */
    model: string;
    /** Non-empty user prompt sent as one user message. */
    user: string;
    /** Optional system instructions. */
    system?: string;
    /** Sampling temperature for providers declaring capabilities.sampling; otherwise reported in ignored. @minimum 0 @maximum 2 */
    temperature?: number;
    /** Output token budget for providers declaring capabilities.sampling; otherwise reported in ignored. @minimum 1 */
    maxTokens?: number;
    /** Reasoning preference such as auto, off, low, medium or high; normalized for providers declaring capabilities.reasoning. */
    reasoningEffort?: string;
    /** Structured output request; the returned text is compact validated JSON. */
    responseFormat?: types.models.ResponseFormat;
    /** Provider-specific options passed unchanged; unknown keys fail INVALID_INPUT in the provider. */
    providerOptions?: Record<string, unknown>;
    /** Stable correlation id reused across retries; generated once when omitted. */
    sessionId?: string;
    /** Total deadline across all attempts and retry delays. @minimum 1 @maximum 3600000 */
    timeoutMs?: number;
    /** Caller cancellation signal; combined with timeoutMs. */
    signal?: AbortSignal;
};
