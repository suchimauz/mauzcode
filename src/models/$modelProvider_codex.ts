/** codex provider metadata and dynamically dispatched operation adapters. */
export default {
    id: "codex",
    label: "Codex",
    description: "ChatGPT subscription through the Codex backend. Log in with a device code; login and all requests use the selected transport.",
    icon: "Bot",
    inference: { priceVendor: "openai" },
    nativeWebSearch: {
        binding: {
            kind: 'login',
            async current(ctx, connectionId) {
                const [row] = await ctx.fns.procs.db.select({ sql: "SELECT codex_generation,codex_credential_revision FROM llm_connections WHERE id=? AND provider='codex'", params: [connectionId] });
                return row?.codex_generation ? { generation: row.codex_generation, revision: String(row.codex_credential_revision) } : null;
            },
            async read(ctx, conn, proof) {
                if (!ctx.state.models?.nativeSearchConnections?.has(conn) || ctx.state.models.nativeSearchReads?.get(proof) !== conn) throw Error('Inactive search credentials');
                const auth = await ctx.fns.models.provider.codex.codexAuth({ conn, op: 'nativeRead', proof });
                if (!auth.accessToken || !auth.accountId) throw Error('Codex login required');
                return { token: auth.accessToken, accountId: auth.accountId };
            },
        },
        async search(ctx, conn, req) {
            if (!ctx.state.models?.nativeSearchConnections?.has(conn)) throw Error('Inactive Codex search');
            req.signal.throwIfAborted();
            if (Date.now() >= req.deadline) throw Error('Codex search deadline exceeded');
            const { values, proof } = await conn.credentials();
            const signal = AbortSignal.any([req.signal, AbortSignal.timeout(Math.max(0, req.deadline - Date.now()))]);
            signal.throwIfAborted();
            if (!ctx.state.models.nativeSearchConnections.has(conn) || !values.token || !values.accountId || Date.now() >= req.deadline) throw Error('Inactive Codex search');
            const response = await conn.request('https://chatgpt.com/backend-api/codex/alpha/search', {
                method: 'POST', headers: { authorization: `Bearer ${values.token}`, 'chatgpt-account-id': values.accountId, accept: 'application/json', 'content-type': 'application/json' },
                body: JSON.stringify({ id: crypto.randomUUID(), model: req.model, input: req.query, commands: { search_query: [{ q: req.query }], response_length: 'short' }, settings: { allowed_callers: ['direct'], external_web_access: true }, max_output_tokens: 4096 }),
            });
            if (!response.ok) {
                void response.body?.cancel().catch(() => {});
                if (response.status === 401) await ctx.fns.models.provider.codex.codexAuth({ conn, op: 'markLogin', auth: { generation: proof.generation, credentialRevision: Number(proof.revision) } });
                throw Error(`Codex search HTTP ${response.status}`);
            }
            const reader = response.body?.getReader();
            if (!reader) throw Error('Invalid Codex search response');
            const cancel = () => { void reader.cancel().catch(() => {}); };
            signal.addEventListener('abort', cancel, { once: true });
            try {
                const decoder = new TextDecoder('utf-8', { fatal: true });
                let bytes = 0, text = '';
                while (true) {
                    signal.throwIfAborted();
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    bytes += chunk.value.length;
                    if (bytes > 1024 * 1024) throw Error('Oversized response');
                    text += decoder.decode(chunk.value, { stream: true });
                }
                signal.throwIfAborted();
                const data: unknown = JSON.parse(text + decoder.decode());
                if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results)) throw Error('Unknown envelope');
                const results: types.models.NativeWebSearchSource[] = [], seen = new Set<string>();
                for (const item of data.results) {
                    if (results.length >= req.limit) break;
                    if (!item || typeof item.url !== 'string' || typeof item.title !== 'string') continue;
                    let url: URL; try { url = new URL(item.url); } catch { continue; }
                    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
                    url.hash = '';
                    if (seen.has(url.href)) continue;
                    seen.add(url.href);
                    results.push({ url: url.href, title: item.title, ...(typeof item.snippet === 'string' ? { description: item.snippet } : {}), ...(typeof (item.published_at ?? item.publishedAt) === 'string' ? { publishedAt: item.published_at ?? item.publishedAt } : {}) });
                }
                return { results };
            } catch {
                cancel(); signal.throwIfAborted(); throw Error('Invalid Codex search response');
            } finally {
                signal.removeEventListener('abort', cancel); reader.releaseLock();
            }
        },
    },
    fields: [
        { key: "clientVersion", label: "Client version", type: "text", help: "Optional Codex client version sent to the backend; defaults to the detected CLI version when enabled, otherwise the documented SDK version." },
        { key: "detectCliVersion", label: "Detect CLI version", type: "boolean", default: false, help: "Use the local codex --version result instead of the SDK default. Cannot be combined with an override." },
    ],
    transports: ["direct", "socks", "ssh-tunnel"],
    validate(ctx, config) { return ctx.fns.models.provider.codex.codexValidate({ config }); },
    async clientVersion(ctx, conn, opts) { return ctx.fns.models.provider.codex.codexClientVersion({ config: conn.config, refresh: opts.refresh }); },
    async test(ctx, conn) { return ctx.fns.models.provider.codex.codexTest({ conn }); },
    async listModels(ctx, conn) { return ctx.fns.models.provider.codex.codexListModels({ conn }); },
    async usage(ctx, conn) { return ctx.fns.models.provider.codex.codexUsage({ conn }); },
    capabilities: { continuationState: true, checkpoints: true, reasoning: true, structuredOutput: true },
    reasoningProfile: (ctx, model) => ctx.fns.models.provider.codex.codexReasoningProfile({ model }),
    async stream(ctx, conn, req) { return ctx.fns.models.provider.codex.codexStream({ conn, req }); },
    async compact(ctx, conn, req) { return ctx.fns.models.provider.codex.codexCompact({ conn, req }); },
    actions: {
        login: { label: "Log in", run: async (ctx, conn) => ctx.fns.models.provider.codex.codexLoginStart({ conn }) },
        loginStatus: {
            label: "Login status",
            run: async (ctx, conn) => ctx.fns.models.provider.codex.codexLoginStatus({ conn }),
        },
        cancelLogin: { label: "Cancel login", run: async (ctx, conn) => ctx.fns.models.provider.codex.codexCancelLogin({ conn }) },
        logout: {
            label: "Log out",
            run: async (ctx, conn) => ctx.fns.models.provider.codex.codexLogout({ conn }),
        },
    },
} satisfies types.models.ProviderDefinition;
