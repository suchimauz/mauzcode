/**
 * One transcription model a provider offers, with the capabilities core needs to segment audio correctly.
 *
 * Capabilities are per model, not per provider: a single vendor can ship one model that cuts turns itself and
 * another that requires core commits.
 */
export type VoiceModel = {
    /** Provider-native model identifier. */
    id: string;
    /** Human-readable name; defaults to the id. */
    label?: string;
    /** Safe explanation, including billing notes such as "metered per audio minute". */
    description?: string;
    capabilities: types.voice.ModelCapabilities;
};
