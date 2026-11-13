/**
 * Shared wire protocol strategy for model discovery and a minimal generation probe.
 * Obtain one through models.protocol.get; a protocol never receives the connection or its secrets, only the transport-bound fetch.
 */
export type Protocol = {
    /** Stable protocol id from the closed registry in models.protocol.get. */
    id: string;
    /** Human-readable protocol name. */
    label: string;
    /** Validate a configured base URL and return the protocol's versioned API base. Throws "Invalid base URL". */
    baseUrl: (ctx: Context, raw: string) => string;
    /** Protocol-required non-authentication headers, sent with or without an API key. */
    defaultHeaders: () => Record<string, string>;
    /** Standard authentication headers for an API key. */
    apiKeyHeaders: (key: string) => Record<string, string>;
    /** Discover unique non-empty model ids in catalogue order through the given fetch. */
    listModels: (ctx: Context, opts: {
        fetch: types.models.ResolvedConnection["fetch"];
        endpoint: types.models.ProtocolEndpoint;
        signal?: AbortSignal;
    }) => Promise<types.models.ModelInfo[]>;
    /** Send one minimal non-streaming generation for a required model id; resolves when the endpoint accepted it. */
    probe: (ctx: Context, opts: {
        fetch: types.models.ResolvedConnection["fetch"];
        endpoint: types.models.ProtocolEndpoint;
        model: string;
        signal?: AbortSignal;
    }) => Promise<void>;
};
