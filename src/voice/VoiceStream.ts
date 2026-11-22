/**
 * Live handle on one provider transcription session, returned by `ProviderDefinition.open`.
 *
 * Core owns segmentation, phrase identity, revision counting and delivery; the stream only carries audio and
 * lifecycle calls. Every method may reject with an `Error` whose `code` is a `types.voice.ErrorCode`; core
 * sanitizes the message before it reaches a client. `cancel` must release the upstream connection and must be
 * safe to call more than once.
 */
export type VoiceStream = {
    /** Append mono PCM16 little-endian audio at the negotiated rate. Frames are ordered by core. */
    append: (pcm: Uint8Array) => Promise<void>;
    /**
     * Ask the provider for one ordered phrase boundary. `order` is assigned by core in the sequence it commits,
     * and the provider must report every later event for that phrase with the same `order`. Models with provider-selected turns report coverage via committed events;
     * core never infers from a missing event that a manual commit is safe.
     */
    commit: (order: number) => Promise<void>;
    /** Stop accepting audio, settle every committed phrase and release upstream resources on success. */
    finish: () => Promise<void>;
    /** Drop all later events and release the upstream resources. */
    cancel: () => Promise<void>;
};
