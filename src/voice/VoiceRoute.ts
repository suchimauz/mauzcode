/**
 * Parsed voice route identity; native model ids may contain slash and colon separators.
 *
 * A voice route names one transcription model of one stored voice connection with the exact grammar
 * `<provider>/<accountName>:<modelId>`: provider up to the first slash, account name up to the following colon,
 * everything after that colon as the native model id.
 */
export type VoiceRoute = {
    /** Registered provider identifier. */
    provider: string;
    /** Stored account name, including spaces. */
    accountName: string;
    /** Provider-native model identifier. */
    modelId: string;
};
