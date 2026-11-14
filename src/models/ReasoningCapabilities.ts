/** Validated reasoning levels one provider model supports, from discovery metadata or a documented SDK profile. */
export type ReasoningCapabilities = {
    /** Supported levels; nonempty, unique, SDK enumeration only. */
    supported: types.models.ReasoningLevel[];
    /** Level applied for an omitted or auto preference; must be one of supported. Omitted means auto applies "auto" and no reasoning setting is sent. */
    default?: types.models.ReasoningLevel;
    /** Native wire value per supported level when it differs from the SDK name, e.g. { off: "none", xhigh: "max" }. */
    wire?: Partial<Record<types.models.ReasoningLevel, string>>;
    /** Off is sent through the protocol's native thinking-disable form. */
    disable?: boolean;
    /** Where the capabilities came from: provider model discovery or a versioned SDK profile. */
    source: "metadata" | "profile";
    /** Versioned profile id when source is profile, e.g. codex-2026-07. */
    profile?: string;
};
