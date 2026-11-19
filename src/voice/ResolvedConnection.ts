/**
 * One saved voice connection with its non-secret configuration, handed to a provider operation.
 *
 * Secret values are never part of `config`: they are read on demand through `secret(key)`, which returns
 * `undefined` when nothing is stored. A provider must never log, return or forward a secret value.
 */
export type ResolvedConnection = {
    /** Connection UUID. */
    id: string;
    /** Registered provider id. */
    provider: string;
    /** Provider-unique account name, 1–100 characters without slash or colon. */
    accountName: string;
    /** Declared non-secret configuration, defaults already applied. */
    config: Record<string, types.voice.ConfigValue>;
    /** Read one declared secret field, or `undefined` when it is not stored. */
    secret: (key: string) => Promise<string | undefined>;
    /** Aborts when the session is cancelled or the connection check times out. */
    signal?: AbortSignal;
    /** Saved network route of this connection; `direct` for connections stored before transports existed. */
    transport: types.voice.TransportSpec;
    /**
     * HTTP bound to this connection's route: the saved SOCKS5 proxy or a pinned SSH tunnel carries the whole
     * exchange (HTTPS only, verified for the destination host), redirects fail and there is no direct fallback.
     * Aborts with `signal`. Failures throw `code: "TRANSPORT"` without upstream text.
     */
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
    /**
     * WebSocket bound to this connection's route: the upgrade and every frame travel over the selected path (TLS
     * verified for the destination host, `wss:` only when routed), redirects are refused and there is no direct
     * fallback. The returned socket starts connecting immediately and ends with `signal`.
     */
    openWebSocket: (url: string, options?: types.voice.WebSocketOptions) => types.voice.BoundWebSocket;
};
