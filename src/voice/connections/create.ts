/**
 * Create a voice connection for a registered provider
 *
 * Use to add an account of a voice provider (built-in or plugin). Validates the provider-unique account name
 * (1–100 characters, no slash or colon) and the configuration against the provider field schema. Secret field
 * values are encrypted under `secret://voice/<id>.<field>` in the same transaction as the row; the row itself
 * stores only which secret fields are present. The transport is validated against the provider's declared kinds and saved
 * infrastructure and stored apart from the configuration. Returns the secret-free view.
 * @param opts.provider Registered provider id.
 * @param opts.accountName Display account name, unique within this provider; no slash or colon.
 * @param opts.config Non-secret configuration; unknown keys are rejected.
 * @param opts.secrets Secret field values keyed by field; null or absent means not set.
 * @param opts.transport Network route; a kind the provider declares, referencing a saved proxy or SSH instance. @default { kind: "direct" }
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
        /** Network route; a kind the provider declares, referencing a saved proxy or SSH instance. @default { kind: "direct" } */
        transport?: types.voice.TransportSpec;
    },
): Promise<types.voice.ConnectionView> {
    const invalid = (message: string, field?: string): never => { throw Object.assign(new Error(message), { code: "VALIDATION", status: 400, ...(field ? { field } : {}) }); };
    const provider = typeof opts.provider === "string" ? opts.provider : "";
    const accountName = typeof opts.accountName === "string" ? opts.accountName.trim() : "";
    if (!accountName || accountName.length > 100) invalid("Account name is required (1–100 characters)", "accountName");
    if (/[/:]/.test(accountName)) invalid("Account name cannot contain / or :", "accountName");
    const { config, secrets } = await ctx.fns.voice.connections.validateConfig({ provider, config: opts.config, secrets: opts.secrets });
    const allowed = ctx.fns.voice.providers({}).find(p => p.id === provider)?.transports ?? ["direct"];
    const transport = await ctx.fns.voice.transport.validate({ transport: opts.transport ?? { kind: "direct" }, allowed });
    const id = crypto.randomUUID();
    const now = Date.now();
    try {
        await ctx.fns.procs.db.transaction({ fn: async () => {
            const duplicate = await ctx.fns.procs.db.select({ sql: "SELECT id FROM voice_connections WHERE provider=? AND account_name=?", params: [provider, accountName] });
            if (duplicate.length) invalid("Account name is already used by this provider", "accountName");
            const presence: Record<string, boolean> = {};
            for (const [key, value] of Object.entries(secrets)) {
                if (value === null) continue;
                await ctx.fns.secrets.putLocal({ namespace: "voice", name: `${id}.${key}`, value, source: "voice" });
                presence[key] = true;
            }
            await ctx.fns.procs.db.run({
                sql: "INSERT INTO voice_connections(id,provider,account_name,config,secrets,transport,created_at,updated_at) VALUES (?,?,?,?::jsonb,?::jsonb,?::jsonb,?,?)",
                params: [id, provider, accountName, JSON.stringify(config), JSON.stringify(presence), JSON.stringify(transport), now, now],
            });
        } });
    } catch (error) {
        if (error && typeof error === "object" && (("code" in error && String(error.code) === "23505") || ("errno" in error && String(error.errno) === "23505"))) invalid("Account name is already used by this provider", "accountName");
        throw error;
    }
    return await ctx.fns.voice.connections.get({ id });
}
