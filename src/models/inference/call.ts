/**
 * Make one non-agent LLM request to an enabled model of a stored connection
 *
 * One-shot inference of the models stack, built over models.inference.stream so providers implement only stream. Sends `user` as one user message with `system` as instructions and optional provider-neutral tools (advertised, not executed). Validates input before any network request (INVALID_INPUT for an empty prompt, out-of-range timeoutMs, maxTokens or temperature) and applies the same enabled/UNSUPPORTED checks as stream. temperature and maxTokens reach only providers declaring capabilities.sampling; dropped names are returned in `ignored`. responseFormat goes natively to providers declaring capabilities.structuredOutput, otherwise a JSON-only instruction is appended; the answer is always normalized to compact JSON (INVALID_OUTPUT on violation). Retries on the same connection per models.inference.retryDecision within the timeoutMs deadline; never switches connection, account or model. Use for runtime synthesis (summaries, classification, JSON extraction) through models connections; legacy callers still use llm.call.
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
    opts: {
        /** Model connection UUID. */
        connectionId: string;
        /** Provider-native model id on the connection. */
        model: string;
        /** Non-empty user prompt. */
        user: string;
        /** Provider-neutral tool definitions advertised to the model, never executed here. */
        tools?: types.models.ToolSpec[];
        /** Optional system instructions. */
        system?: string;
        /** Sampling temperature for providers declaring capabilities.sampling. @minimum 0 @maximum 2 */
        temperature?: number;
        /** Output token budget for providers declaring capabilities.sampling. @minimum 1 */
        maxTokens?: number;
        /** Reasoning preference such as auto, off, low, medium or high. */
        reasoningEffort?: string;
        /** Structured output request; the returned text is compact validated JSON. */
        responseFormat?: types.models.ResponseFormat;
        /** Provider-specific options passed unchanged. */
        providerOptions?: Record<string, unknown>;
        /** Stable correlation id reused across retries; generated once when omitted. */
        sessionId?: string;
        /** Total deadline across attempts and retry delays. @minimum 1 @maximum 3600000 */
        timeoutMs?: number;
        /** Caller cancellation signal; combined with timeoutMs. */
        signal?: AbortSignal;
    },
): Promise<types.models.CallResult> {
    const invalid = (message: string) => ctx.fns.models.inference.failure({ message, status: 400, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
    const user = typeof opts.user === "string" ? opts.user.trim() : "";
    if (!user) throw invalid("user prompt is required");
    if (opts.timeoutMs !== undefined && (!Number.isInteger(opts.timeoutMs) || opts.timeoutMs < 1 || opts.timeoutMs > 3600000)) throw invalid("timeoutMs must be an integer in 1..3600000");
    if (opts.maxTokens !== undefined && (!Number.isInteger(opts.maxTokens) || opts.maxTokens < 1)) throw invalid("maxTokens must be a positive integer");
    if (opts.temperature !== undefined && (typeof opts.temperature !== "number" || !Number.isFinite(opts.temperature) || opts.temperature < 0 || opts.temperature > 2)) throw invalid("temperature must be a number in 0..2");
    const format = opts.responseFormat;
    if (format !== undefined && !(format?.type === "json_object" || (format?.type === "json_schema" && typeof format.name === "string" && !!format.schema && typeof format.schema === "object"))) throw invalid("responseFormat must be json_object or json_schema with name and schema");

    const deadlineAt = opts.timeoutMs === undefined ? undefined : Date.now() + opts.timeoutMs;
    const deadline = opts.timeoutMs === undefined ? undefined : AbortSignal.timeout(opts.timeoutMs);
    const signal = opts.signal && deadline ? AbortSignal.any([opts.signal, deadline]) : opts.signal ?? deadline;
    signal?.throwIfAborted();

    // Fail fast for disabled connections/models and learn the provider capabilities (no network).
    const view = await ctx.fns.models.inference.assertModelEnabled({ id: opts.connectionId, model: opts.model });
    const providers = ctx.state.models?.providers ?? {};
    const caps = Object.hasOwn(providers, view.provider) ? providers[view.provider]!.definition.capabilities : undefined;
    const ignored: types.models.CallResult["ignored"] = [];
    if (!caps?.sampling) {
        if (opts.temperature !== undefined) ignored.push("temperature");
        if (opts.maxTokens !== undefined) ignored.push("maxTokens");
    }
    const native = !!format && !!caps?.structuredOutput;
    const fallback = format && !native ? ctx.fns.models.inference.structured({ action: "instruction", format }) : "";
    const system = opts.system ?? "";
    const instructions = fallback ? (system ? system + "\n\n" + fallback : fallback) : system;
    const sessionId = opts.sessionId || Bun.randomUUIDv7();

    const wait = (ms: number) => new Promise<void>((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(signal!.reason); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
    });

    for (let attempt = 1; ; attempt++) {
        try {
            const result = await ctx.fns.models.inference.stream({
                connectionId: opts.connectionId, model: opts.model, instructions,
                messages: [{ role: "user", content: user }], sessionId, signal,
                ...(opts.tools !== undefined ? { tools: opts.tools } : {}),
                ...(opts.reasoningEffort !== undefined ? { reasoningEffort: opts.reasoningEffort } : {}),
                ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
                ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
                ...(native ? { responseFormat: format } : {}),
                ...(opts.providerOptions !== undefined ? { providerOptions: opts.providerOptions } : {}),
            });
            const text = format ? ctx.fns.models.inference.structured({ action: "normalize", format, text: result.text }) : result.text;
            return { text, finishReason: result.finishReason, usage: result.usage, ...(result.reasoning ? { reasoning: result.reasoning } : {}), attempts: attempt, ignored };
        } catch (error) {
            if (signal?.aborted) throw error;
            const failure = error && typeof error === "object" && "failure" in error ? (error as { failure: types.models.FailureInfo }).failure : null;
            const decision = ctx.fns.models.inference.retryDecision({ failure, attempt });
            if (!decision.retry || (deadlineAt !== undefined && Date.now() + decision.delayMs >= deadlineAt)) throw error;
            await wait(decision.delayMs);
        }
    }
}
