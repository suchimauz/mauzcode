/**
 * Live handle on one normalized voice session, created by `voice.session.open`.
 *
 * This is the whole surface a transport needs: it feeds audio, asks for the last phrase, finishes with a bounded
 * deadline and cancels. Phrase identity, commit order, revision counting, server-side segmentation, generations,
 * deadlines and error sanitization all live inside the handle, so the WebSocket endpoint (and every test) sees the
 * same behavior and forwards `types.voice.SessionEvent` values verbatim.
 */
export type VoiceSession = {
    /** Session identity, stable for the whole session and never reused. */
    sessionId: string;
    /** The route resolved once when the session opened; a preference change applies to the next session. */
    route: types.voice.ResolvedRoute;
    /**
     * Feed one mono PCM16 little-endian frame at `route.sampleRate`. Audio after `finish` or `cancel` is dropped.
     * Transport failures close the session and report an `error` event.
     */
    append: (pcm: Uint8Array) => Promise<void>;
    /**
     * Ask for one extra phrase boundary now for a client-turn model, without waiting for silence. Core assigns the order.
     * @returns the order of the committed phrase, or `undefined` when there was nothing to commit.
     */
    commit: () => Promise<number | undefined>;
    /**
     * Commit the buffered audio and settle every committed phrase within the configured deadline.
     * @returns `ok: true` once nothing is pending; on a bound or provider failure `ok: false` with its code.
     */
    finish: () => Promise<{ ok: boolean; code?: types.voice.ErrorCode }>;
    /**
     * Drop every later event and release the provider stream; bounded and idempotent. Never throws.
     * @param code When given, one `error` event with that code is delivered before closing — used for a takeover
     *   (`superseded`) or lost edit access (`readOnly`); omitted, the cancel is silent because the caller is the one
     *   ending the session deliberately.
     */
    cancel: (code?: types.voice.ErrorCode) => Promise<void>;
    /** In-memory counters only: no audio and no transcript text. */
    status: () => types.voice.SessionStatus;
};
