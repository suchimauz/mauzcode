/** Secret-free model descriptor returned by a provider or manual configuration. */
export type ModelInfo = {
    /** Provider-native model identifier. */
    id: string;
    label?: string;
    description?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    /** Provider-reported reasoning levels, optional default and native wire values, when discovery supplies them. */
    reasoning?: {
        supported: types.models.ReasoningLevel[];
        /** Level applied for auto; omitted means auto sends no reasoning setting. */
        default?: types.models.ReasoningLevel;
        /** Native wire value per supported level when it differs from the SDK name, e.g. { off: "none", xhigh: "max" }. */
        wire?: Partial<Record<types.models.ReasoningLevel, string>>;
        /** The model can switch thinking off through its protocol's native disable form (Anthropic thinking disabled). */
        disable?: boolean;
        /** The model has a native adaptive-thinking switch; protocols that support it send it for every applied level other than off. */
        adaptive?: boolean;
        /** False means the model only switches thinking on or off and no effort value is sent. @default true */
        effort?: boolean;
        /** Variant-backed levels: each level is a separate provider-native model id of this connection, in provider listing order. models.stream sends the chosen member id as the model and no effort value; never a wire parameter. `default` is the member id used for auto when it is eligible. models.listModels marks members the owner disabled. */
        variants?: { members: { level: types.models.ReasoningLevel; id: string; disabled?: boolean }[]; default?: string };
    };
    /** Discovery explicitly supplied no usable reasoning levels. Do not fall back to a profile. Mutually exclusive with reasoning. */
    reasoningUnavailable?: true;
    /** Route-specific display metadata; does not opt other providers into Codex wire semantics. */
    responseControls?: {
        speed?: { supported: ("standard" | "fast" | "ultrafast")[] };
        verbosity?: { supported: ("low" | "medium" | "high")[]; default?: "low" | "medium" | "high" };
    };
    /** Native shared protocol of this model, used by protocol-route providers. */
    protocol?: types.models.ProtocolRoute["protocol"];
    /** Structured model family reported by discovery, used to attribute quota measurements; never derived from a label. */
    family?: "gemini" | "claude";
    /** Set by models.listModels: true when the owner disabled this model on the connection, or when no variant member remains enabled. */
    disabled?: boolean;
};
