/**
 * Update a voice connection, keeping omitted secrets and the stored configuration
 *
 * Use to rename, reconfigure or re-key a connection. Omitted fields keep their stored values. `config`, when
 * given, replaces the whole non-secret configuration; when omitted, the stored configuration is never rewritten,
 * so a rename or a secret change cannot lose it — not even while the provider declaration is unloaded and its
 * configuration projects as empty. Secret fields: a string replaces the stored value, `null` clears it, an
 * omitted key keeps it. The provider cannot change. Validation and merging run against the row locked inside the
 * transaction, so two independent updates (a rename and a reconfiguration) both survive. A duplicate account
 * name fails validation without storing anything. An omitted `transport` keeps the saved route (even a stale
 * reference); a submitted one equal to the saved selection is accepted unchanged, any other is validated against the
 * provider's declared kinds and saved infrastructure. Bumps `updatedAt`. Returns the secret-free view.
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
    const invalid = (message: string, field?: string): never => { throw Object.assign(new Error(message), { code: "VALIDATION", status: 400, ...(field ? { field } : {}) }); };
    const current = await ctx.fns.voice.connections.get({ id: opts.id });
    const id = current.id;
    let accountName: string | undefined;
    if (opts.accountName !== undefined) {
        accountName = typeof opts.accountName === "string" ? opts.accountName.trim() : "";
        if (!accountName || accountName.length > 100) invalid("Account name is required (1–100 characters)", "accountName");
        if (/[/:]/.test(accountName)) invalid("Account name cannot contain / or :", "accountName");
    }
    const revalidate = opts.config !== undefined || opts.secrets !== undefined;
    try {
        await ctx.fns.procs.db.transaction({ fn: async () => {
            // Everything below works on the locked row: the pre-lock view may be stale, and a projection taken
            // while the provider is unloaded is empty, so writing it back would erase the stored configuration.
            const rows = await ctx.fns.procs.db.select({ sql: "SELECT * FROM voice_connections WHERE id=? FOR UPDATE", params: [id] });
            if (!rows[0]) throw Object.assign(new Error("Voice connection not found"), { code: "NOT_FOUND", status: 404 });
            const locked = ctx.fns.voice.connections.toView({ row: rows[0] });
            const nextName = accountName ?? locked.accountName;
            const duplicate = await ctx.fns.procs.db.select({ sql: "SELECT id FROM voice_connections WHERE provider=? AND account_name=? AND id<>?", params: [locked.provider, nextName, id] });
            if (duplicate.length) invalid("Account name is already used by this provider", "accountName");
            const presence: Record<string, boolean> = {};
            const storedRaw = typeof rows[0].secrets === "string" ? JSON.parse(rows[0].secrets) as Record<string, unknown> : { ...((rows[0].secrets ?? {}) as Record<string, unknown>) };
            for (const key of Object.keys(storedRaw)) presence[key] = storedRaw[key] === true;
            let config: Record<string, types.voice.ConfigValue> | undefined;
            let secrets: Record<string, string | null> = {};
            if (revalidate) {
                const checked = await ctx.fns.voice.connections.validateConfig({
                    provider: locked.provider,
                    config: opts.config ?? locked.config,
                    secrets: opts.secrets,
                    stored: Object.keys(presence).filter(key => presence[key]),
                });
                secrets = checked.secrets;
                // Only a submitted configuration replaces the stored one; an omitted one is left untouched.
                if (opts.config !== undefined) config = checked.config;
            }
            for (const [key, value] of Object.entries(secrets)) {
                if (value === null) {
                    await ctx.fns.secrets.deleteLocal({ namespace: "voice", name: `${id}.${key}` });
                    delete presence[key];
                } else {
                    await ctx.fns.secrets.putLocal({ namespace: "voice", name: `${id}.${key}`, value, source: "voice" });
                    presence[key] = true;
                }
            }
            let transport: types.voice.TransportSpec | undefined;
            if (opts.transport !== undefined) {
                const submitted: unknown = opts.transport;
                const record = submitted && typeof submitted === "object" && !Array.isArray(submitted) ? submitted as Record<string, unknown> : undefined;
                const saved = locked.transport as Record<string, string>;
                const unchanged = !!record && Object.keys(record).length === Object.keys(saved).length && Object.keys(saved).every(key => record[key] === saved[key]);
                // Re-saving the unchanged selection keeps it as is, even while its saved reference is unavailable.
                if (!unchanged) {
                    const allowed = ctx.fns.voice.providers({}).find(p => p.id === locked.provider)?.transports ?? ["direct"];
                    transport = await ctx.fns.voice.transport.validate({ transport: submitted, allowed });
                }
            }
            const assignments = ["account_name=?", "secrets=?::jsonb"];
            const params: unknown[] = [nextName, JSON.stringify(presence)];
            if (transport !== undefined) {
                assignments.push("transport=?::jsonb");
                params.push(JSON.stringify(transport));
            }
            if (config !== undefined) {
                assignments.push("config=?::jsonb");
                params.push(JSON.stringify(config));
            }
            assignments.push("updated_at=GREATEST(updated_at+1, ?)");
            params.push(Date.now(), id);
            await ctx.fns.procs.db.run({ sql: `UPDATE voice_connections SET ${assignments.join(", ")} WHERE id=?`, params });
        } });
    } catch (error) {
        if (error && typeof error === "object" && (("code" in error && String(error.code) === "23505") || ("errno" in error && String(error.errno) === "23505"))) invalid("Account name is already used by this provider", "accountName");
        throw error;
    }
    return await ctx.fns.voice.connections.get({ id });
}
