/** Options for `ResolvedConnection.openWebSocket`. */
export type WebSocketOptions = {
    /** Extra handshake headers, for example `Authorization`; framing and upgrade headers are reserved. */
    headers?: Record<string, string>;
    /** Optional `Sec-WebSocket-Protocol` values. */
    protocols?: string[];
};
