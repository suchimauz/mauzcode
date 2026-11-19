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
};
