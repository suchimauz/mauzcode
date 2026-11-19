/**
 * Closed set of codes a voice session may end with.
 *
 * A session that ends abnormally reports exactly one of these with a short user-facing message that contains no
 * vendor payload and no key material. The set is closed so clients can render a stable explanation per code.
 */
export type ErrorCode =
    | "unauthorized"
    | "readOnly"
    | "superseded"
    | "unconfigured"
    | "routeUnavailable"
    | "providerAuth"
    | "provider"
    | "timeout"
    | "backpressure"
    | "protocol";
