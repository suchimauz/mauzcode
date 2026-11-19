/**
 * Per-connection or per-chat recognition options, already narrowed to what the resolved model declares.
 *
 * Core filters fields by `ModelCapabilities`; providers validate the remaining values before opening upstream.
 * A field absent here means "let the connection or provider default apply".
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
