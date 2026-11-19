/**
 * Clamped numeric thresholds one live session runs with.
 *
 * Produced by `voice.session.limits` from a caller's `VoiceSessionConfig`: every field is a finite number inside its
 * documented range, so the session core never has to re-check a caller's value and a misconfigured client can make
 * dictation coarser or slower but never unbounded.
 */
export type SessionLimits = {
    /** Energy window length in milliseconds; one commit decision is taken per window. */
    frameMs: number;
    /** Silence after speech that requests a commit. */
    silenceMs: number;
    /** Continuous speech after which a commit is forced at the quietest recent window. */
    forceCommitMs: number;
    /** Root-mean-square amplitude of a window that counts as speech, on a 0–1 scale. */
    speechRms: number;
    /** Deadline for `finish`, including a provider that ignores its abort signal. */
    finishTimeoutMs: number;
    /** Deadline for `cancel`, so a hung provider cannot hold a released session. */
    cancelTimeoutMs: number;
    /** Audio queued for the provider but not yet accepted; above this the session ends with `backpressure`. */
    maxBufferedBytes: number;
};
