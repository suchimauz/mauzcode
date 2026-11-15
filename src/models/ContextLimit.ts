/** Effective local context budget of one model on one connection, with its provenance. */
export type ContextLimit = {
    /** Provider catalogue context window in tokens; null when discovery supplied none. */
    provider: number | null;
    /** Owner override in tokens on this connection; null when not set. */
    override: number | null;
    /** Public model catalogue context window in tokens (models.dev, then pi-ai); present only when a catalogue describes the model. */
    catalog?: number;
    /** Tokens used for local budgeting and compaction: override, else provider, else catalogue, else 200000. */
    effective: number;
    /** Which value produced `effective`. */
    source: "override" | "provider" | "catalog" | "fallback";
};
