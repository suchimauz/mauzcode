/**
 * WebSocket-like client bound to a voice connection's route, returned by `ResolvedConnection.openWebSocket`.
 *
 * It behaves like a client `WebSocket`: it starts `CONNECTING` (0), dispatches `open` once the upgrade succeeded on
 * the selected path, then `message` events (`data` is a string for text frames, an `ArrayBuffer` for binary ones),
 * and finally exactly one `close`. A failure dispatches a safe `error` event (never an upstream payload, URL or
 * credential) followed by `close`. A refused upgrade reports `Expected 101 status code: <status>` in the error
 * message; redirects are never followed and a routed socket never retries directly.
 */
export type BoundWebSocket = EventTarget & {
    /** 0 connecting, 1 open, 2 closing, 3 closed. */
    readonly readyState: number;
    /** Bytes queued locally and not yet written to the network. */
    readonly bufferedAmount: number;
    /** Send one text or binary message; throws when the socket is not open. */
    send(data: string | ArrayBuffer | ArrayBufferView): void;
    /** Start the close handshake. */
    close(code?: number, reason?: string): void;
    /** Drop the connection immediately and release its route. */
    terminate(): void;
};
