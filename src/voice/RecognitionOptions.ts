/**
 * Per-connection or per-chat recognition options, already narrowed to what the resolved model declares.
 *
 * Core validates these against `ModelCapabilities` before opening a provider, so a provider may send every
 * present field without re-checking support. A field absent here means "let the provider default apply".
 */
export type RecognitionOptions = {
    /** Recognition language hints (BCP-47 or the provider's documented subset); only when `capabilities.languages`. */
    languages?: string[];
    /** Domain keyword list that biases recognition; only when `capabilities.keywords`. */
    keywords?: string[];
    /** Free-text context or spelling hints; only when `capabilities.prompt`. */
    prompt?: string;
    /** Latency/eagerness hint for interim results; only when `capabilities.delay`. */
    delay?: "minimal" | "low" | "medium" | "high" | "xhigh";
};
