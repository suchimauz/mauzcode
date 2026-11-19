/**
 * Secret-free catalogue entry for one registered voice provider.
 *
 * The projection carries metadata a picker or a settings form needs: where the audio goes, which fields a
 * connection has and which transcription models the provider offers. It never carries a handler, an ownership
 * detail, a connection value or a secret default.
 */
export type ProviderView = {
    /** Lowercase kebab-case provider id. */
    id: string;
    /** Human-readable provider name. */
    label: string;
    /** Short safe explanation shown next to the provider. */
    description?: string;
    /** Where the captured audio is processed; disclosed to the user before the microphone is opened. */
    destination: types.voice.Destination;
    /** Network routes a connection of this provider may select; `["direct"]` when the provider declares none. */
    transports: types.voice.TransportSpec["kind"][];
    /** Connection field schema of this provider. */
    fields: types.voice.ProviderFieldView[];
    /** Transcription models the provider declares statically; discovery results are not part of the catalogue. */
    models: types.voice.VoiceModel[];
};
