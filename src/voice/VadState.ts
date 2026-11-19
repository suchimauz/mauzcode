/**
 * Server-side energy detector state for one session.
 *
 * The detector owns segmentation for models without provider turn detection: it turns a stream of PCM16 into ordered
 * commit decisions while forwarding every byte it is given exactly once. It keeps only a short rolling tail of recent
 * windows so a forced commit can still be placed inside the last half second, and it never holds a transcript or any
 * vendor state — so the same detector is driven by a fake provider in tests and a real one in production.
 */
export type VadState = {
    /** Turn detection the selected model declares; `server` forwards audio without core boundaries. */
    turnDetection: "client" | "server";
    /** Sample rate of the incoming audio in Hz. */
    sampleRate: number;
    /** Clamped thresholds this detector runs with. */
    limits: types.voice.SessionLimits;
    /** Bytes of one energy window. */
    frameBytes: number;
    /** Windows kept back so a forced commit can be placed at the quietest recent window. */
    lookbackFrames: number;
    /** Consecutive silent windows that request a commit once the phrase contains speech. */
    silenceFrames: number;
    /** Windows in one phrase after which a commit is forced. */
    forceFrames: number;
    /** Tail of the last push that did not fill a whole window yet. */
    carry: Uint8Array;
    /** Windows not yet forwarded, oldest first; never longer than `lookbackFrames` between boundaries. */
    held: Uint8Array[];
    /** Root-mean-square amplitude of each held window, parallel to `held`. */
    energies: number[];
    /** Consecutive speech windows at the tail of the stream. */
    speechRun: number;
    /** Consecutive silent windows at the tail of the stream. */
    silenceRun: number;
    /** Whether the audio since the last commit contains any speech at all. */
    hasSpeech: boolean;
    /** Windows since the last commit; drives the forced commit. */
    phraseWindows: number;
    /** Byte offset just past the latest speech in a full analysis window; used for server turns only. */
    lastSpeechByte: number;
    /** PCM bytes pushed into the detector so far. */
    pushedBytes: number;
    /** PCM bytes handed to the provider so far; equal to `pushedBytes` once the session is flushed. */
    forwardedBytes: number;
};
