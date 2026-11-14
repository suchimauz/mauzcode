/** Requested versus applied reasoning, resolved by models.stream before inference for opted-in providers. */
export type ReasoningResolution = {
    /** Caller preference as submitted; omitted is reported as auto. Never written back to caller settings. */
    requested: types.models.ReasoningLevel | "auto";
    /** Level the provider must send; "auto" (only when capabilities declare no default) means send no reasoning setting. */
    applied: types.models.ReasoningLevel | "auto";
    /** Native wire value of the applied level, when capabilities declare one. */
    wire?: string;
    /** Applied off should use the protocol's native thinking-disable form. */
    disable?: boolean;
    /** Why applied differs from requested (fallback), or null. */
    fallbackReason: string | null;
    source: types.models.ReasoningCapabilities["source"];
    profile?: string;
};
