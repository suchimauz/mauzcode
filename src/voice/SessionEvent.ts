/**
 * One normalized message the session core delivers to its single consumer.
 *
 * A consumer (the voice WebSocket endpoint) forwards these verbatim: they are already ordered, already phrased and
 * already free of vendor payloads or key material. `phrase` carries the complete text of one phrase together with a
 * stable `id`, the commit `order` core assigned and a strictly increasing `revision`; the same phrase may be revised
 * several times and ends with exactly one `final`.
 */
export type SessionEvent =
    /** One complete hypothesis of one phrase; `final` marks the single terminal revision of that order. */
    | {
        type: "phrase";
        /** Stable phrase identity for the whole session; never reused for another order. */
        id: string;
        /** Position of the phrase in the session's commit sequence, starting at zero. */
        order: number;
        /** Strictly increasing revision number, starting at one; the final carries the highest revision. */
        revision: number;
        /** Complete text of the phrase as it currently stands, never a delta. */
        text: string;
        /** True only on the single terminal revision of this phrase. */
        final: boolean;
    }
    /** One committed phrase could not be transcribed; the session continues and later phrases are still delivered. */
    | {
        type: "phraseFailed";
        id: string;
        order: number;
        /** Closed local reason: `provider` for a vendor failure, `timeout` for a recognition deadline. */
        reason: "provider" | "timeout";
    }
    /** Every committed phrase settled after `finish`; nothing more will be delivered. */
    | { type: "completed" }
    /** The session ended abnormally; `message` is one fixed sentence free of vendor text and key material. */
    | {
        type: "error";
        code: types.voice.ErrorCode;
        message: string;
        /** Opaque journal reference, only present after successful persistence. */
        errorId?: string;
    };
