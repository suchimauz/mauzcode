/**
 * In-memory report of one live session, for diagnostics and for the WebSocket endpoint's own bookkeeping.
 *
 * Contains no audio and no transcript text: only counters and lifecycle state, so it is safe to read while a session
 * is running and safe to attach to an internal diagnostic.
 */
export type SessionStatus = {
    /** Session identity, stable for the whole session and never reused. */
    sessionId: string;
    /** `open` accepts audio, `closing` is finishing, `closed` drops every later event and frame. */
    state: "open" | "closing" | "closed";
    /** Incremented once when the session reaches a terminal state; a later frame or callback is stale. */
    generation: number;
    /** Phrases core has committed so far, in commit order. */
    committed: number;
    /** Committed phrases that already reported a final or a failure. */
    settled: number;
    /** Live and out-of-order terminal records; released when the ordered final is delivered. */
    retainedPhrases: number;
    /** Provider-selected turn IDs still awaiting terminal recognition. */
    retainedTurns: number;
    /** Audio windows submitted to the energy detector. */
    audioWindows: number;
    /** PCM bytes accepted for transcription. */
    audioBytes: number;
    /** Provider-reported billable audio seconds for this session, counted in memory only. */
    usage: {
        audioSeconds: number;
    };
};
