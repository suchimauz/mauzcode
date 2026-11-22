/**
 * Dispatch the native link source selected by an issuing model step.
 *
 * Internal facade integration. Consumes a one-use authorized query. Returns null only for an ordinary source. Revalidates the step, provider registration, route and account under the connection lock before credential reads and at the final transport handoff.
 * @param opts.query Validated search phrase from the authorized websearch facade.
 * @param opts.limit Bounded number of ranked links requested by the facade. @minimum 1 @maximum 20
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Validated search phrase from the authorized websearch facade. */
        query: string;
        /** Bounded number of ranked links requested by the facade. @minimum 1 @maximum 20 */
        limit: number;
    },
): Promise<{ engine: string; results: types.models.NativeWebSearchSource[] } | null> {
    const state = ctx.state.models;
    if (!state?.nativeSearchQueries?.delete(opts)) throw new Error('Native search requires the websearch facade');
    const toolRun = (ctx as Context & { toolRun?: object }).toolRun;
    const step = toolRun && state.nativeSearchSteps?.get(toolRun);
    if (!step?.decision.registration) return null;
    const { decision } = step, { origin, registration, proof: issued } = decision;
    const operation = registration!;
    const stale = () => new Error('Native search authorization changed or is unavailable; start a new model turn');
    if (!issued) throw stale();
    const deadline = Date.now() + 20_000, end = new AbortController();
    const signal = AbortSignal.any([step.signal, end.signal, AbortSignal.timeout(20_000)]);
    const checkStep = () => {
        if (signal.aborted || Date.now() >= deadline || !origin.current() || session?.agent !== origin.agent ||
            !ctx.fns.plugins.list({}).some(p => p.name === 'websearch') || !origin.agent.preset ||
            !ctx.fns.agentPreset.allows({snapshot: origin.agent.preset, name: 'websearch.search'}) ||
            state.providers?.[decision.provider]?.native !== operation) throw stale();
    };
    // All key/account writers take the connection row first. Do not await the network inside this transaction.
    const checked = async <T>(use: (proof: types.models.NativeWebSearchProof) => T | Promise<T>): Promise<T> => {
        checkStep();
        return ctx.fns.procs.db.transaction({ fn: async () => {
            const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT * FROM llm_connections WHERE id=? FOR SHARE', params: [decision.connectionId] });
            const view = row && ctx.fns.models.connections.toView({row});
            if (!view?.enabled || view.provider !== decision.provider || view.accountName !== decision.accountName ||
                view.disabledModels.includes(decision.model) || !Bun.deepEquals(view.transport, decision.transport)) throw stale();
            const [agentRow] = await ctx.fns.procs.db.select({ sql: 'SELECT model,run_state,run_token FROM agents WHERE id=? AND archived_at IS NULL FOR SHARE', params: [origin.agent.id] });
            if (agentRow?.model !== origin.route || (origin.claim && (agentRow.run_state !== 'running' || agentRow.run_token !== origin.claim))) throw stale();
            const binding = operation.binding;
            const proof = binding.kind === 'key'
                ? (view.secrets[binding.field] && await ctx.fns.models.nativeSearch.keyProof({id: view.id, field: binding.field}))
                : await binding.current(ctx, view.id);
            if (!proof || proof.generation !== issued.generation || !proof.revision || (binding.kind === 'key' && proof.revision !== issued.revision)) throw stale();
            await ctx.fns.models.inference.assertProviderEnabled({provider: decision.provider});
            checkStep();
            return use(Object.freeze({generation: proof.generation, revision: proof.revision}));
        } }) as Promise<T>;
    };
    let triedRead = false, handedOff = false, requested = false;
    let credentialProof: types.models.NativeWebSearchProof | undefined;
    const conn: types.models.NativeWebSearchConnection = Object.freeze({
        id: decision.connectionId,
        credentials: async () => {
            if (triedRead || !state.nativeSearchConnections?.has(conn)) throw stale();
            triedRead = true;
            return checked(async proof => {
                let values: Record<string,string>;
                const binding = operation.binding;
                if (binding.kind === 'key') {
                    const value = await ctx.fns.secrets.getLocal({namespace:'models', name: conn.id + '.' + binding.field});
                    if (!value) throw stale();
                    values = { [binding.field]: value };
                } else {
                    const reads = state.nativeSearchReads ??= new WeakMap();
                    reads.set(proof, conn);
                    try { values = await binding.read(ctx, conn, proof); } finally { reads.delete(proof); }
                }
                checkStep();
                credentialProof = proof;
                return { values: Object.freeze({...values}), proof };
            });
        },
        request: async (url: string, init: Parameters<types.models.NativeWebSearchConnection['request']>[1]) => {
            checkStep();
            if (requested || !credentialProof || !state.nativeSearchConnections?.has(conn) || init?.method !== 'POST' || typeof init.body !== 'string') throw stale();
            requested = true;
            const body = init.body, tuple = credentialProof;
            const wire: RequestInit = { method: 'POST', headers: new Headers(init.headers), signal };
            const handoffs = state.nativeSearchHandoff ??= new WeakMap();
            handoffs.set(wire, async send => { await checked(proof => {
                if (handedOff || tuple.revision !== proof.revision || tuple.generation !== proof.generation) throw stale();
                handedOff = true;
                send(body); // synchronous direct fetch or proxy write; no credential writer can interleave
            }); });
            try {
                const response = await ctx.fns.models.transport.fetch({transport: decision.transport, url, init: wire, signal, timeoutMs: Math.max(1, deadline - Date.now())});
                if (!handedOff) { void response.body?.cancel().catch(() => {}); throw stale(); }
                return response;
            } finally { handoffs.delete(wire); }
        },
    });
    let stop: (() => void) | undefined;
    try {
        await checked(() => {});
        checkStep();
        (state.nativeSearchCalls ??= new WeakSet()).add(conn);
        (state.nativeSearchConnections ??= new WeakSet()).add(conn);
        const abort = new Promise<never>((_, reject) => { stop = () => reject(stale()); signal.addEventListener('abort', stop, {once: true}); });
        const result = await Promise.race([abort, operation.search(ctx, conn, { model: decision.model, query: opts.query, limit: opts.limit, deadline, signal })]);
        checkStep();
        if (!handedOff || !Array.isArray(result?.results)) throw stale();
        return { engine: 'native:' + decision.provider, results: result.results };
    } catch {
        // A plugin exception can contain credentials, provider bodies or arbitrary strings.
        throw new Error('websearch.search: native:' + decision.provider + ': request unavailable or authorization changed');
    } finally {
        if (stop) signal.removeEventListener('abort', stop);
        state.nativeSearchCalls?.delete(conn);
        state.nativeSearchConnections?.delete(conn);
        end.abort();
    }
}
