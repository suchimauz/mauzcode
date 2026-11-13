/** Provider-built endpoint for a shared wire protocol: versioned API base and the complete request headers, including any authentication. */
export type ProtocolEndpoint = {
    /** Versioned API base without a trailing slash, as returned by Protocol.baseUrl. */
    base: string;
    /** Lowercase-keyed request headers merged by the provider (Accept, protocol defaults, API-key headers). */
    headers: Record<string, string>;
};
