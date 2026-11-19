/**
 * Outbound route of one voice connection.
 *
 * Same discriminated shape as Models transports. Non-direct kinds only reference saved infrastructure — a SOCKS5
 * proxy by id or a trusted SSH instance by name — and never carry credentials inline. A stored connection without
 * a selection is `direct`.
 */
export type TransportSpec =
    | { kind: "direct" }
    | { kind: "socks"; proxyId: string }
    | { kind: "ssh-tunnel"; instance: string };
