/**
 * Validate and normalize a voice connection transport selection
 *
 * Use before storing a voice connection's route. Accepts exactly `{kind:"direct"}`, `{kind:"socks",proxyId}` or
 * `{kind:"ssh-tunnel",instance}` for a kind the provider declares; rejects any other property (inline hosts,
 * ports, usernames, passwords, keys), a malformed or unknown saved SOCKS5 proxy and an SSH instance that is unknown
 * or has no pinned host key. Never opens a network connection, decrypts credentials or echoes submitted values:
 * every failure is `code: "VALIDATION"`, `field: "transport"` with a fixed message. Returns the clean selection.
 * @param opts.transport Submitted transport selection.
 * @param opts.allowed Transport kinds declared by the connection's provider.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Submitted transport selection. */
        transport: unknown;
        /** Transport kinds declared by the connection's provider. */
        allowed: types.voice.TransportSpec["kind"][];
    },
): Promise<types.voice.TransportSpec> {
    const fail = (message: string): never => { throw Object.assign(new Error(message), { code: "VALIDATION", status: 400, field: "transport" }); };
    const t = opts.transport;
    if (!t || typeof t !== "object" || Array.isArray(t)) return fail("Transport must be an object");
    const record = t as Record<string, unknown>;
    const kind = record.kind;
    if (kind !== "direct" && kind !== "socks" && kind !== "ssh-tunnel") return fail("Unknown transport kind");
    if (!opts.allowed.includes(kind)) return fail("This voice provider does not support the selected transport");
    const expected = kind === "socks" ? ["kind", "proxyId"] : kind === "ssh-tunnel" ? ["kind", "instance"] : ["kind"];
    // A route references saved infrastructure only; any extra key could be an inline credential.
    if (Object.keys(record).some(key => !expected.includes(key))) return fail("Transport accepts only a saved proxy or SSH instance reference");
    if (kind === "direct") return { kind: "direct" };
    if (kind === "socks") {
        const proxyId = record.proxyId;
        if (typeof proxyId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proxyId)) return fail("Choose a saved SOCKS5 proxy");
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT id FROM socks_proxies WHERE id=?", params: [proxyId] });
        if (!rows.length) return fail("The selected SOCKS5 proxy does not exist");
        return { kind: "socks", proxyId };
    }
    const instance = record.instance;
    if (typeof instance !== "string" || !instance.trim() || instance.length > 200) return fail("Choose an SSH instance");
    let pinned = false;
    try { pinned = !!(await ctx.fns.sshInstance.get({ name: instance })).pinnedHostKey; } catch { return fail("The selected SSH instance does not exist"); }
    if (!pinned) return fail("The selected SSH instance has no verified host key");
    return { kind: "ssh-tunnel", instance };
}
