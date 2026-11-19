/**
 * What a transcription model can accept from core and from the connection's options.
 *
 * `turnDetection: "client"` means the model has no server-side segmentation, so core must commit phrases itself
 * (energy VAD plus the finish commit). `"server"` means the provider cuts turns and receives no core commit
 * except on finish.
 */
export type ModelCapabilities = {
    turnDetection: "client" | "server";
    /** Sample rates in Hz the model accepts; core negotiates the first entry. A non-empty list is required. */
    sampleRates: number[];
    /** Accepts a language hint, so `languages` may be configured per connection or chat. */
    languages?: boolean;
    /** Accepts a keyword list that biases recognition toward domain terms. */
    keywords?: boolean;
    /** Accepts a free-text prompt that carries context and spelling hints. */
    prompt?: boolean;
    /** Accepts a latency/eagerness hint for interim results. */
    delay?: boolean;
};
