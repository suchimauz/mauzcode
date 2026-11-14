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
    };
    /** Native shared protocol of this model, used by protocol-route providers. */
    protocol?: types.models.ProtocolRoute["protocol"];
    /** Set by models.listModels: true when the owner disabled this model on the connection. */
    disabled?: boolean;
};
