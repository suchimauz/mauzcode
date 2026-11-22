/**
 * Bind the native search choice to an actual agent reply.
 *
 * Consumes the server-issued primary inference identity. Captures a secret-free account proof at transport handoff and attaches it only to that response’s tool objects, never to serialized arguments or continuation state.
 * @param opts.conn Exact inference connection that the SDK just resolved.
 * @param opts.model Provider-native model used by this inference.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact inference connection that the SDK just resolved. */
        conn: types.models.ResolvedConnection;
        /** Provider-native model used by this inference. */
        model: string;
    },
): (calls: types.models.StreamResult["toolCalls"]) => void {
    const { conn } = opts, state = ctx.state.models;
    const ticket = state?.nativeSearchInference?.get(conn);
    const origin = ticket && state.nativeSearchOrigins?.get(ticket.request);
    if (!ticket || !origin) return () => {};
    state.nativeSearchInference!.delete(conn);
    state.nativeSearchOrigins!.delete(ticket.request);
    const registration = state.nativeSearchResolved?.get(conn);
    state.nativeSearchResolved?.delete(conn);
    let read: types.models.NativeWebSearchProof | null = null;
    let sent: types.models.NativeWebSearchProof | null = null;
    let open = true, ambiguous = false;
    const noteKey = (proof: types.models.NativeWebSearchProof | null) => {
        if (read && (!proof || read.revision !== proof.revision)) ambiguous = true;
        read = proof;
    };
    if (registration) {
        const binding = registration.binding;
        if (binding.kind === 'key') {
            const secret = conn.secret;
            conn.secret = async key => {
                if (key !== binding.field) return secret(key);
                // Map wire bytes only to an unambiguous issuing key. Two different revisions observed by
                // one provider invocation cannot prove which key it chose for its Authorization header.
                const capture = await ctx.fns.procs.db.transaction({ fn: async () => {
                    await ctx.fns.procs.db.select({ sql: 'SELECT id FROM llm_connections WHERE id=? FOR SHARE', params: [conn.id] });
                    const proof = await ctx.fns.models.nativeSearch.keyProof({ id: conn.id, field: key });
                    const value = await secret(key);
                    return {value, proof: value ? proof : null};
                } }) as {value: string | null; proof: types.models.NativeWebSearchProof | null};
                if (open) noteKey(capture.proof);
                return capture.value;
            };
        } else {
            conn.attestNativeWebSearch = proof => { if (open) read = proof?.generation && proof.revision ? Object.freeze({ generation: proof.generation, revision: proof.revision }) : null; };
        }
        const fetch = conn.fetch;
        conn.fetch = async (url, init = {}) => {
            const issued = read;
            const handoffs = state.nativeInferenceHandoff ??= new WeakMap();
            handoffs.set(init, () => {
                if (!open) return;
                const proof = binding.kind === 'key' ? issued : read;
                // A provider may issue multiple requests. Disagreeing accounts or keys cannot authorize a reply.
                if (sent && (!proof || sent.generation !== proof.generation || (binding.kind === 'key' && sent.revision !== proof.revision))) ambiguous = true;
                sent = proof;
            });
            try { return await fetch(url, init); } finally { handoffs.delete(init); }
        };
    }
    return calls => {
        if (!open) return;
        open = false;
        const decision = Object.freeze({ origin, registration, model: opts.model, provider: conn.provider, accountName: conn.accountName,
            connectionId: conn.id, transport: structuredClone(ticket.view.transport), proof: ambiguous ? null : sent });
        const replies = state.nativeSearchReplies ??= new WeakMap();
        for (const call of calls) replies.set(call, decision);
    };
}
