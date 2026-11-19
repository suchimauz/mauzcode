/**
 * Secret-free projection of one stored voice connection.
 *
 * Every public projection of a voice connection uses this shape. A secret field is reported only as present
 * (`true`) or absent (`false`): never a value, never a `secret://` reference and never a stored key name.
 */
export type ConnectionView = {
    /** Connection UUID. */
    id: string;
    /** Provider id that owns the connection. */
    provider: string;
    /** False when the provider declaration is no longer registered; the connection survives but cannot be used. */
    providerRegistered: boolean;
    /** Provider-unique display account name, 1–100 characters without slash or colon. */
    accountName: string;
    /** Declared non-secret configuration with defaults applied; never contains a secret value. */
    config: Record<string, types.voice.ConfigValue>;
    /** Declared secret fields reported only as present (`true`) or absent (`false`). */
    secrets: Record<string, boolean>;
    /**
     * Where this connection sends captured audio: the provider's per-connection disclosure (for example the host
     * and port of a configured endpoint) or, without one, its static declaration. Absent when the provider is
     * not registered. Never contains userinfo, a path, a query, a fragment or a secret.
     */
    destination?: types.voice.Destination;
    /** Unix epoch milliseconds when the connection was created. */
    createdAt: number;
    /** Unix epoch milliseconds of the last accepted change. */
    updatedAt: number;
};
