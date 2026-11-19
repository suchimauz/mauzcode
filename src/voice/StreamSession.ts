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
    /**
     * Report a terminal, sanitized failure; core maps it to a `types.voice.ErrorCode` and closes the session.
     * Optional diagnostics go only to the owner's error journal: `diagnosticReason` names what ended the session
     * (`socketClosed`, `socketError`, `serviceError`, `malformedMessage`, `sequenceMismatch`, `sendFailed`,
     * `setupTimeout`, `finishTimeout`; anything else becomes `other`) and `diagnosticDetail` is a WebSocket close code
     * (1000–4999) or a lowercase service identifier (`^[a-z][a-z0-9_.]{0,63}$`); any other detail is dropped.
     * Thrown errors from `open`, `append`, `commit` and `finish` may carry the same fields.
     */
    fail: (error: {
        code: types.voice.ErrorCode;
        message: string;
        diagnosticCause?: "authentication" | "rateLimit" | "timeout" | "unknown";
        diagnosticReason?: string;
        diagnosticDetail?: string;
    }) => void;
};
