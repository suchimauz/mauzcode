/**
 * Create a model connection for a registered provider
 *
 * Use to add an account of a provider (built-in or plugin). Validates the provider-unique account name (1–100 characters, no slash or colon), configuration against the provider schema and provider `validate`, and the transport against the provider's allowed kinds and saved proxies/SSH instances. Secret field values are encrypted under `secret://models/<id>.<field>` in the same transaction as the row. Does not touch existing LLM routes, accounts or agents. Returns the secret-free view.
 * @param opts.provider Registered provider id.
 * @param opts.accountName Display account name, unique within the provider; no slash or colon.
 * @param opts.config Non-secret configuration; the core key `models` holds manual model ids.
 * @param opts.secrets Secret field values keyed by field; null or absent means not set.
 * @param opts.transport Outbound transport. @default { kind: "direct" }
 * @param opts.enabled Whether tests, model listing and usage may use the network. @default true
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Registered provider id. */
        provider: string;
        /** Display account name, unique within the provider; no slash or colon. */
        accountName: string;
        /** Non-secret configuration; the core key `models` holds manual model ids. */
        config?: Record<string, unknown>;
        /** Secret field values keyed by field; null or absent means not set. */
        secrets?: Record<string, string | null>;
        /** Outbound transport. @default { kind: "direct" } */
        transport?: types.models.TransportSpec;
        /** Whether tests, model listing and usage may use the network. @default true */
        enabled?: boolean;
    },
): Promise<types.models.ConnectionView> {
    return ctx.fns.models.connections.create(opts);
}
