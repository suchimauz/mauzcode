/**
 * One ordered action the session core applies to the provider stream.
 *
 * Steps are produced in stream order: every `audio` step is appended as it appears and every `commit` step asks the
 * provider for a phrase boundary at exactly that point. Because the plan is a single ordered list, the forced split
 * can place audio on both sides of a commit without losing or repeating a byte, and a test can verify the boundary
 * against the exact input offsets.
 */
export type VadStep =
    /** Mono PCM16 little-endian audio to append, already in the negotiated rate. */
    | { type: "audio"; pcm: Uint8Array }
    /** Ask the provider for one phrase boundary after every preceding audio step. */
    | { type: "commit" };
