/**
 * Everything a provider needs besides its connection to open one live session.
 *
 * The session is a narrow sink: a provider reports phrase updates and errors and nothing else, so a provider never
 * needs to know how phrases are buffered, revised or delivered to a browser.
 */
export type StreamSession = {
    /** Sample rate core negotiated for this session, in Hz; always one of the model's `capabilities.sampleRates`. */
    sampleRate: number;
    /** Recognition options narrowed to the resolved model's capabilities. */
    options: types.voice.RecognitionOptions;
    /** Aborts when the session is cancelled, times out or loses edit access; a provider must close on it. */
    signal: AbortSignal;
    /** Report provider-selected boundaries, phrase updates and usage. Events after `cancel` are dropped. */
    emit: (event: types.voice.PhraseEvent) => void;
    /** Report a terminal, sanitized failure; core maps it to a `types.voice.ErrorCode` and closes the session. */
    fail: (error: { code: types.voice.ErrorCode; message: string; diagnosticCause?: "authentication" | "rateLimit" | "timeout" | "unknown" }) => void;
};
