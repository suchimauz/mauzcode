/** Provider-built endpoint for a shared wire protocol: versioned API base and the complete request headers, including any authentication. */
export type ProtocolEndpoint = {
    /** Versioned API base without a trailing slash, as returned by Protocol.baseUrl. */
    base: string;
    /** Lowercase-keyed request headers merged by the provider (Accept, protocol defaults, API-key headers). */
    headers: Record<string, string>;
    /** Optional extra JSON body fields merged after the protocol's own request fields; validated by models.inference.streamRoute before any request. */
    body?: Record<string, unknown>;
    /** Replay stored assistant reasoning from tool-call turns where the protocol can carry it; false or absent sends nothing extra. @default false */
    replayReasoning?: boolean;
};
