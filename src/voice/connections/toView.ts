/**
 * Project a stored voice_connections row into a secret-free connection view
 *
 * Use whenever a connection leaves the voice module. Reports each declared or stored secret field only as
 * set/not set; never includes a secret value, a `secret://` reference or a stored secret name. The
 * configuration is projected through the current provider schema, so a field that became a secret field after a
 * schema reload is never returned as plain configuration, and a field the provider no longer declares is dropped.
 * @param opts.row Raw voice_connections row as returned by procs.db.select.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Raw voice_connections row as returned by procs.db.select. */
        row: Record<string, unknown>;
    },
): types.voice.ConnectionView {
    const row = opts.row;
    const parse = <T>(value: unknown, fallback: T): T => typeof value === "string" ? (() => { try { return JSON.parse(value) as T; } catch { return fallback; } })() : ((value as T) ?? fallback);
    const provider = String(row.provider);
    const entry = Object.hasOwn(ctx.state.voice?.providers ?? {}, provider) ? ctx.state.voice!.providers![provider] : undefined;
    const definition = entry?.definition;
    const stored = parse<Record<string, unknown>>(row.secrets, {});
    const secrets: Record<string, boolean> = {};
    for (const field of definition?.fields ?? []) if (field.type === "secret") secrets[field.key] = false;
    for (const key of Object.keys(stored)) secrets[key] = stored[key] === true;
    const rawConfig = parse<Record<string, unknown>>(row.config, {});
    const config: Record<string, types.voice.ConfigValue> = {};
    for (const field of definition?.fields ?? []) {
        // A field that became secret after the connection was stored must never be projected as configuration.
        if (field.type === "secret") continue;
        const value = rawConfig[field.key];
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") config[field.key] = value;
    }
    return {
        id: String(row.id),
        provider,
        providerRegistered: !!entry,
        accountName: String(row.account_name),
        config,
        secrets,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}
