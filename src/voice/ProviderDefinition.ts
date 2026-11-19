/**
 * SDK contract for a mounted `$voiceProvider_<id>.ts` declaration.
 *
 * A voice provider is declared independently of the Models SDK: it owns its connection fields, its
 * transcription models and the transport that streams audio to the recognizer. Core calls a provider only
 * through this contract, so a new recognizer needs no composer or session-code change.
 */
export type ProviderDefinition = {
    /** Lowercase kebab-case id matching the declaration filename. */
    id: string;
    /** Human-readable provider name. */
    label: string;
    /** Short safe explanation shown next to the provider; never include credentials. */
    description?: string;
    /** Where the captured audio is processed, disclosed to the user before capture. */
    destination: types.voice.Destination;
    /** Connection field schema; secret fields are stored in the secret store and never returned. */
    fields: types.voice.FieldSpec[];
    /** Fixed model catalogue; declare it, `listModels`, or both (the union of the two). */
    models?: types.voice.VoiceModel[];
    /** Discover additional models for one connection; never perform transcription here and never log secrets. */
    listModels?: (ctx: Context, conn: types.voice.ResolvedConnection) => Promise<types.voice.VoiceModel[]>;
    /** Check one connection without sending user audio; must not log or return credentials. */
    test: (ctx: Context, conn: types.voice.ResolvedConnection) => Promise<types.voice.TestResult>;
    /**
     * Open one live transcription session. Resolve only after the upstream session accepts the transcription
     * intent, so core may start forwarding audio. Report every phrase update through `session.emit` and never
     * compute phrase order: core supplies it to `VoiceStream.commit`. For provider-selected turns, report the
     * `committed` boundary with an opaque `turnId` before emitting that turn's phrase updates.
     */
    open: (ctx: Context, conn: types.voice.ResolvedConnection, session: types.voice.StreamSession) => Promise<types.voice.VoiceStream>;
};
