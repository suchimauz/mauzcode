import { createHmac, randomBytes } from "node:crypto";

/** Authenticate a Codex dispatch result using its issuing generation and a private installation key. Never infer a missing generation from current account state. */
export default async function (
    ctx: Context, _session: Session | null,
    opts: {
        /** Verified generation captured with dispatch credentials, or null for unknown identity. */
        generation: string | null;
        /** Returned scoped sticky state (mutually exclusive with a checkpoint). */
        state?: types.models.ProviderState;
        /** Returned SDK checkpoint including its native item, before adding the binding. */
        checkpoint?: types.models.Checkpoint;
        /** Only provision the installation key for a newly issued provider result, never during verification. */
        issue?: boolean;
    },
): Promise<string | null> {
    const { generation, state, checkpoint } = opts;
    if (!generation || !!state === !!checkpoint) return null;
    // Fixed-order, length-delimited scope and wire fields. Never hash a caller's JSON serialization.
    let domain: unknown[];
    if (state) {
        if (state.provider !== 'codex' || !state.connectionId || !state.sessionId || !state.runId || typeof state.data?.turnState !== 'string' || !state.data.turnState || Object.keys(state.data).length !== 1) return null;
        domain = ['sticky', state.provider, state.connectionId, state.sessionId, state.runId, state.data.turnState];
    } else {
        const c = checkpoint!, p = c.payload;
        if (c.provider !== 'codex' || c.kind !== 'native-checkpoint' || c.version !== 1 || !c.connectionId || !c.model || p?.type !== 'compaction' || typeof p.encrypted_content !== 'string' || !p.encrypted_content || (p.id !== undefined && typeof p.id !== 'string') || Object.keys(p).some(k => !['type', 'id', 'encrypted_content'].includes(k))) return null;
        domain = ['checkpoint', c.provider, c.connectionId, c.model, p.type, p.id ?? null, p.encrypted_content];
    }
    // Dedicated, durable secret; racing issuers re-read the one winning insert. Never replace a corrupt key.
    const ref = { namespace: 'models', name: 'codex-opaque-mac-v1' };
    let key: string | null;
    try {
        key = await ctx.fns.secrets.getLocal({ ...ref });
        if (key === null && opts.issue) {
            await ctx.fns.secrets.putLocal({ ...ref, value: randomBytes(32).toString('hex'), source: 'codex-binding', ifAbsent: true });
            key = await ctx.fns.secrets.getLocal({ ...ref });
        }
    } catch { return null; } // No key means no proof. Never forward secret-store diagnostics.
    if (!key || !/^[a-f0-9]{64}$/.test(key)) return null;
    return createHmac('sha256', Buffer.from(key, 'hex')).update(JSON.stringify(['codex-opaque-v1', generation, ...domain])).digest('hex');
}
