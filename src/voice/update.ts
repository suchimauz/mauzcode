/**
 * Update a voice connection, keeping omitted secrets
 *
 * Use to rename, reconfigure or re-key a connection. Omitted fields keep their stored values; `config`, when
 * given, replaces the whole non-secret configuration and is revalidated. Secret fields: a string replaces the
 * stored value, `null` clears it, an omitted key keeps it. The provider cannot change. Returns the secret-free
 * view.
 * @param opts.id Connection UUID.
 * @param opts.accountName New display account name (1–100 characters).
 * @param opts.config Replacement non-secret configuration.
 * @param opts.secrets Secret changes: string sets, null clears, absent keeps.
 * @param opts.transport Replacement network route; omitted keeps the saved one.
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
        /** Replacement network route; omitted keeps the saved one. */
        transport?: types.voice.TransportSpec;
    },
): Promise<types.voice.ConnectionView> {
    return ctx.fns.voice.connections.update(opts);
}
