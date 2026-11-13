/**
 * Update a model connection, keeping omitted secrets
 *
 * Use to rename, reconfigure, change transport, or enable/disable a connection. Omitted fields keep their stored values; `config`, when given, replaces the whole non-secret configuration and is revalidated. Secret fields: a string replaces the stored value, `null` deletes it, an omitted key keeps it. The provider cannot change. Bumps `updatedAt`, which invalidates cached health. Returns the secret-free view.
 * @param opts.id Connection UUID.
 * @param opts.accountName New display account name (1–100 characters).
 * @param opts.config Replacement non-secret configuration.
 * @param opts.secrets Secret changes: string sets, null clears, absent keeps.
 * @param opts.transport Replacement outbound transport.
 * @param opts.enabled New enabled flag.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** New display account name (1–100 characters). */
        accountName?: string;
        /** Replacement non-secret configuration. */
        config?: Record<string, unknown>;
        /** Secret changes: string sets, null clears, absent keeps. */
        secrets?: Record<string, string | null>;
        /** Replacement outbound transport. */
        transport?: types.models.TransportSpec;
        /** New enabled flag. */
        enabled?: boolean;
    },
): Promise<types.models.ConnectionView> {
    return ctx.fns.models.connections.update(opts);
}
