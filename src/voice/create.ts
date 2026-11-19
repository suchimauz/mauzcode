/**
 * Create a voice connection for a registered provider
 *
 * Use to add an account of a voice provider (built-in or plugin). Validates the provider-unique account name
 * (1–100 characters, no slash or colon) and the configuration against the provider field schema. Secret field
 * values are encrypted in the secret store in the same transaction as the row; the row itself stores only which
 * secret fields are present. Returns the secret-free view.
 * @param opts.provider Registered provider id.
 * @param opts.accountName Display account name, unique within this provider; no slash or colon.
 * @param opts.config Non-secret configuration; unknown keys are rejected.
 * @param opts.secrets Secret field values keyed by field; null or absent means not set.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Registered provider id. */
        provider: string;
        /** Display account name, unique within this provider; no slash or colon. */
        accountName: string;
        /** Non-secret configuration; unknown keys are rejected. */
        config?: Record<string, unknown>;
        /** Secret field values keyed by field; null or absent means not set. */
        secrets?: Record<string, string | null>;
    },
): Promise<types.voice.ConnectionView> {
    return ctx.fns.voice.connections.create(opts);
}
