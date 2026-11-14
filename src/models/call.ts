/**
 * Make one non-agent LLM request to an enabled model of a stored connection
 *
 * Public one-shot entry point of the models stack; delegates to models.inference.call. Sends a single user prompt (with optional system instructions, no tools) through the provider's stream operation, applying enabled checks, capability-gated temperature/maxTokens (dropped names reported in `ignored`), structured output (native or instruction fallback, normalized to compact JSON, INVALID_OUTPUT on violation) and bounded same-connection retries within timeoutMs. Use instead of llm.call when the caller addresses a models connection by connectionId and model.
 * @param opts.connectionId Model connection UUID.
 * @param opts.model Provider-native model id on the connection.
 * @param opts.user Non-empty user prompt.
 * @param opts.system Optional system instructions.
 * @param opts.temperature Sampling temperature for providers declaring capabilities.sampling. @minimum 0 @maximum 2
 * @param opts.maxTokens Output token budget for providers declaring capabilities.sampling. @minimum 1
 * @param opts.reasoningEffort Reasoning preference such as auto, off, low, medium or high.
 * @param opts.responseFormat Structured output request; the returned text is compact validated JSON.
 * @param opts.providerOptions Provider-specific options passed unchanged.
 * @param opts.sessionId Stable correlation id reused across retries; generated once when omitted.
 * @param opts.timeoutMs Total deadline across attempts and retry delays. @minimum 1 @maximum 3600000
 * @param opts.signal Caller cancellation signal; combined with timeoutMs.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: types.models.CallRequest,
): Promise<types.models.CallResult> {
    return ctx.fns.models.inference.call(opts);
}
