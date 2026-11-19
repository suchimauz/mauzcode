/**
 * One phrase update reported by a provider.
 *
 * A provider never assigns phrase order or revision numbers and never assembles the client transcript: it reports
 * the `order` core handed it through `VoiceStream.commit`, or an opaque `turnId` for a boundary the provider
 * selected itself. Core owns identity, ordering, revision counting, finalization and delivery.
 */
export type PhraseEvent =
    /** Provider-selected boundary, reported in audio order before any text. `endByte` is the exclusive PCM byte
     * offset consumed by this turn in the input stream; later audio may already have been appended. */
    | { type: "committed"; turnId: string; endByte: number }
    /** Provider-reported billable audio seconds for this session; counted in memory and never persisted. */
    | { type: "usage"; audioSeconds: number }
    | (({ order: number } | { turnId: string }) & (
        /** Complete current text of a committed phrase, not a delta. */
        | { type: "revision"; text: string }
        /** Final text of a committed phrase. */
        | { type: "final"; text: string }
        /** One committed phrase failed; the session continues and later phrases are still delivered. */
        | { type: "failed"; message: string }
    ));
