/**
 * Project a stored voice_connections row into a secret-free connection view
 *
 * Use whenever a connection leaves the voice module. Reports each declared or stored secret field only as
 * set/not set; never includes a secret value, a `secret://` reference or a stored secret name. The
 * configuration is projected through the current provider schema, so a field that became a secret field after a
 * schema reload is never returned as plain configuration, and a field the provider no longer declares is dropped.
 * The audio destination comes from the provider's optional `destinationFor(config)` disclosure, accepted only as
 * a short single-line label without URL syntax (`/`, `@`, `?`, `#`) or control characters; otherwise, or when it
 * throws, the static declared destination is used. The transport is projected as a saved reference only; a row
 * without one (stored before transports existed) reports `direct`.
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
    // Untrusted declaration: project only kind and a safe label; a throw or bad shape keeps the static disclosure.
    const safe = (value: unknown): types.voice.Destination | undefined => {
        try {
            if (!value || typeof value !== "object") return undefined;
            const { kind, label } = value as Record<string, unknown>;
            if (kind !== "cloud" && kind !== "host") return undefined;
            if (typeof label !== "string" || !label.trim() || label.length > 160 || /[/@?#\\\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(label)) return undefined;
            return { kind, label };
        } catch { return undefined; }
    };
    let destination: types.voice.Destination | undefined;
    if (definition) {
        try { destination = definition.destinationFor ? safe(definition.destinationFor(Object.freeze({ ...config }))) : undefined; } catch { destination = undefined; }
        destination ??= (() => { try { return { kind: definition.destination.kind, label: definition.destination.label }; } catch { return undefined; } })();
    }
    // Project only the reference: a stored row never carries credentials, and anything unexpected reads as direct.
    const storedTransport = parse<Record<string, unknown> | null>(row.transport, null);
    const transport: types.voice.TransportSpec = storedTransport?.kind === "socks" && typeof storedTransport.proxyId === "string"
        ? { kind: "socks", proxyId: storedTransport.proxyId }
        : storedTransport?.kind === "ssh-tunnel" && typeof storedTransport.instance === "string"
            ? { kind: "ssh-tunnel", instance: storedTransport.instance }
            : { kind: "direct" };
    return {
        id: String(row.id),
        provider,
        providerRegistered: !!entry,
        accountName: String(row.account_name),
        config,
        transport,
        secrets,
        ...(destination ? { destination } : {}),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}
