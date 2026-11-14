/** Result of models.call. */
export type CallResult = {
    /** Generated text; compact JSON when responseFormat was requested. */
    text: string;
    /** Normalized finish reason such as stop, length or tool_calls; null when unknown. */
    finishReason: string | null;
    /** Token usage reported by the provider for the successful attempt. */
    usage: types.models.StreamResult["usage"];
    /** Requested and applied reasoning when the provider declares capabilities.reasoning. */
    reasoning?: types.models.ReasoningResolution;
    /** Number of attempts made, including the successful one. @minimum 1 @maximum 3 */
    attempts: number;
    /** Option names dropped because the provider does not declare the matching capability. */
    ignored: ("temperature" | "maxTokens")[];
};
