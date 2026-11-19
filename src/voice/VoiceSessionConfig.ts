/**
 * Server-side segmentation thresholds and session deadlines.
 *
 * Everything here runs on the MauzCode server, so every client gets identical behavior and the thresholds are
 * tuned in one place. A value outside its documented range is clamped rather than rejected: a misconfigured client
 * can make dictation coarser or slower, but never unbounded. Audio is measured in 20 ms windows of mono PCM16 at the
 * negotiated rate; a window counts as speech when its root-mean-square amplitude reaches `speechRms`.
 */
export type VoiceSessionConfig = {
    /** Energy window length in milliseconds, 10–100. @default 20 */
    frameMs?: number;
    /** Silence after speech that requests a commit, 2×`frameMs`–5000 ms. @default 500 */
    silenceMs?: number;
    /** Continuous speech after which a commit is forced at the quietest recent window, ≥`silenceMs`+`frameMs` and ≤120000 ms. @default 15000 */
    forceCommitMs?: number;
    /** Root-mean-square amplitude of a window that counts as speech, 0.0001–0.5 on a 0–1 scale. @default 0.01 */
    speechRms?: number;
    /** Deadline for `finish`, 100–120000 ms, even for a provider that ignores its abort signal. @default 10000 */
    finishTimeoutMs?: number;
    /** Deadline for `cancel`, 100–120000 ms, so a hung provider cannot hold a released session. @default 5000 */
    cancelTimeoutMs?: number;
};
