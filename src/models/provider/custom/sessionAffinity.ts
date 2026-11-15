/**
 * Derive the opaque x-session-affinity header value for a custom connection and conversation identity.
 *
 * Returns the first 32 lowercase hex characters of HMAC-SHA256 over `<connectionId>:<key>` keyed with an installation-wide secret salt. The salt is created lazily (32 random bytes) in the local encrypted secret store as secret://models/session-affinity-salt, inserted without overwrite and re-read so concurrent first calls agree, cached in memory, and replaced when unreadable. Returns null (and logs one warning) when the salt cannot be stored or read, so inference never fails because of affinity. Use from custom provider streaming to pin a conversation to one backend without revealing raw agent ids.
 * @param opts.connectionId Model connection id; scopes the value so the same conversation is not linkable across connections.
 * @param opts.key Conversation identity: the request promptCacheKey, falling back to its sessionId.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model connection id; scopes the value so the same conversation is not linkable across connections. */
        connectionId: string;
        /** Conversation identity: the request promptCacheKey, falling back to its sessionId. */
        key: string;
    },
): Promise<string | null> {
    const key = String(opts.key ?? "");
        const connectionId = String(opts.connectionId ?? "");
        if (!key || !connectionId) return null;
        const state = (ctx.state.models ??= {});
        if (!state.sessionAffinitySalt) {
            const namespace = "models", name = "session-affinity-salt";
            const fresh = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
            const valid = (v: string | null) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : null;
            state.sessionAffinitySalt = (async () => {
                try {
                    let stored: string | null = null;
                    let unreadable = false;
                    try { stored = await ctx.fns.secrets.getLocal({ namespace, name }); }
                    catch { unreadable = true; }
                    if (valid(stored)) return stored;
                    // Missing: insert without overwriting a concurrent writer. Unreadable or malformed: replace.
                    if (stored === null && !unreadable) await ctx.fns.secrets.putLocal({ namespace, name, value: fresh(), source: "session-affinity", ifAbsent: true });
                    else await ctx.fns.secrets.putLocal({ namespace, name, value: fresh(), source: "session-affinity" });
                    const reread = valid(await ctx.fns.secrets.getLocal({ namespace, name }));
                    if (!reread) throw new Error("stored session affinity salt is unreadable");
                    return reread;
                } catch (error) {
                    if (!state.sessionAffinityWarned) {
                        state.sessionAffinityWarned = true;
                        ctx.fns.procs.log.warn({ event: "models.sessionAffinity.salt", msg: "session affinity header disabled: " + String((error as Error)?.message ?? error) });
                    }
                    state.sessionAffinitySalt = undefined;
                    return null;
                }
            })();
        }
        const salt = await state.sessionAffinitySalt;
        if (!salt) return null;
        const hmac = new Bun.CryptoHasher("sha256", Buffer.from(salt, "hex"));
        hmac.update(connectionId + ":" + key);
        return hmac.digest("hex").slice(0, 32);
}
