/**
 * Create a model connection for a registered provider
 *
 * Use to add an account of a provider (built-in or plugin). Validates the provider-unique account name (1–100 characters, no slash or colon), configuration against the provider schema and provider `validate`, and the transport against the provider's allowed kinds and saved proxies/SSH instances. Secret field values are encrypted under `secret://models/<id>.<field>` in the same transaction as the row. Does not touch existing LLM routes, accounts or agents. Returns the secret-free view.
 * @param opts.provider Registered provider id.
 * @param opts.accountName Display account name, unique within this provider; no slash or colon.
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
        /** Display account name, unique within this provider; no slash or colon. */
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
    const invalid = (message: string, field?: string): never => { throw Object.assign(new Error(message), { code: "VALIDATION", status: 400, ...(field ? { field } : {}) }); };
    const accountName = typeof opts.accountName === "string" ? opts.accountName.trim() : "";
    if (!accountName || accountName.length > 100) invalid("Account name is required (1–100 characters)", "accountName");
    if (/[/:]/.test(accountName)) invalid("Account name cannot contain / or :", "accountName");
    if (opts.enabled !== undefined && typeof opts.enabled !== "boolean") invalid("enabled must be true or false", "enabled");
    const { config, secrets } = await ctx.fns.models.connections.validateConfig({ provider: opts.provider, config: opts.config, secrets: opts.secrets });
    const transport = opts.transport ?? { kind: "direct" as const };
    const def = ctx.state.models!.providers![opts.provider]!.definition;
    try { await ctx.fns.models.transport.validateTransport({ transport, allowed: def.transports }); }
    catch (error) { invalid(error instanceof Error ? error.message : "Invalid transport", "transport"); }
    const clean: types.models.TransportSpec = transport.kind === "socks" ? { kind: "socks", proxyId: transport.proxyId } : transport.kind === "ssh-tunnel" ? { kind: "ssh-tunnel", instance: transport.instance } : { kind: "direct" };
    const id = crypto.randomUUID();
    const now = Date.now();
    const refs: Record<string, string> = {};
    try { await ctx.fns.procs.db.transaction({ fn: async () => {
        const duplicate = await ctx.fns.procs.db.select({ sql: "SELECT id FROM llm_connections WHERE provider=? AND account_name=?", params: [opts.provider, accountName] });
        if (duplicate.length) invalid("Account name is already used by this provider", "accountName");
        for (const [key, value] of Object.entries(secrets)) {
            if (value === null) continue;
            await ctx.fns.secrets.putLocal({ namespace: "models", name: `${id}.${key}`, value, source: "models" });
            refs[key] = `secret://models/${id}.${key}`;
        }
        await ctx.fns.procs.db.run({
            sql: "INSERT INTO llm_connections(id,provider,account_name,config,secrets,transport,enabled,created_at,updated_at) VALUES (?,?,?,?::jsonb,?::jsonb,?::jsonb,?,?,?)",
            params: [id, opts.provider, accountName, JSON.stringify(config), JSON.stringify(refs), JSON.stringify(clean), opts.enabled ?? true, now, now],
        });
    } }); } catch (error) {
        if (error && typeof error === "object" && (("code" in error && String(error.code) === "23505") || ("errno" in error && String(error.errno) === "23505"))) invalid("Account name is already used by this provider", "accountName");
        throw error;
    }
    return await ctx.fns.models.connections.get({ id });
}
