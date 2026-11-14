/** Provider-neutral callable tool; providers own all wire-format conversion. */
export type ToolSpec = {
    /** Stable function name exposed to the model. */
    name: string;
    /** Explain when the model should use the tool. */
    description: string;
    /** JSON Schema describing the tool arguments, without a provider wrapper. */
    parameters: Record<string, unknown>;
};
