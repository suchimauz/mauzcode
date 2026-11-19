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
    /**
     * Optional per-connection disclosure derived from one connection's normalized non-secret configuration, for
     * example the host and port of a configured endpoint. Core shows it in settings, in the chat route picker and
     * in the session `ready` event, and falls back to `destination` when this is absent, throws or returns an
     * invalid label. The label may name a host and port only: never userinfo, a path, a query, a fragment, a
     * secret or any other configuration value.
     */
    destinationFor?: (config: Readonly<Record<string, types.voice.ConfigValue>>) => types.voice.Destination | undefined;
    /** Connection field schema; secret fields are stored in the secret store and never returned. */
    fields: types.voice.FieldSpec[];
    /**
     * Check normalized non-secret fields before saving. Return the declared non-secret field that failed and,
     * optionally, a closed reason for core to render. Never return field values or custom error text.
     */
    validateConfig?: (config: Readonly<Record<string, types.voice.ConfigValue>>) => {
        field: string;
        reason?: "keywordList" | "languageList" | "httpsEndpoint" | "headerIdentifier";
    } | undefined;
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
