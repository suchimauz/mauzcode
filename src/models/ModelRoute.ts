/** Parsed model identity; native model ids may contain slash and colon separators. */
export type ModelRoute = {
    /** Registered provider identifier. */
    provider: string;
    /** Stored account name, including spaces. */
    accountName: string;
    /** Provider-native model identifier. */
    modelId: string;
};
