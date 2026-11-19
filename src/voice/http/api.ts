/**
 * Owner-only HTTP API behind the Voice settings tab and the per-chat voice route selector
 *
 * Backs GET/POST /voice/api. GET returns the secret-free provider catalogue, stored connections, the selectable
 * routes (every stored connection of a registered provider × its statically declared models, each with the
 * audio destination of that connection — the provider's per-connection disclosure such as the configured host and
 * port, else its static declaration), the global default route with `fixed: true` when an instance settings file pins
 * it, the saved SOCKS5 proxies (`id`, `name`, `host`, `port`) and verified SSH instance names a connection transport
 * may reference, and a cookie-bound CSRF token. With `?agentId=` it also returns `chat`: the effective route of that owned
 * chat, its source (`override`, `default`, `none`) and status — `unconfigured`, `ready` with the destination and
 * model, or `unavailable` with a closed reason; the selected route is never replaced by another one. POST takes one
 * JSON object `{ action, ... }`: `create` and `update` (both accept an optional `transport`), `remove` (requires `confirmed: true`), `test`,
 * `setDefaultRoute` (`{ route }`, empty string clears it), `setChatRoute` (`{ agentId, route }`) and
 * `clearChatRoute` (`{ agentId }`). Route writes accept only a route that resolves now. Chat reads and writes
 * require a chat created by this owner; chat writes also require it not to be archived. POST requires same
 * origin, a valid `x-csrf-token`, `application/json` and at most 64 KiB, enforced while the body streams in:
 * reading stops at the first chunk past the limit whether or not `Content-Length` is declared. Anonymous callers get
 * 401 and non-owners 403. Responses never contain secret values, `secret://` references or echoed route strings from
 * errors. No microphone, audio or provider session is involved; only the explicit `test` action contacts a provider.
 * @param opts.req Incoming GET or JSON POST request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Incoming GET or JSON POST request. */
        req: Request;
    },
): Promise<Response> {
    const headers = { "Cache-Control": "no-store", "Vary": "Cookie" };
    const reply = (body: object, status = 200) => Response.json(body, { status, headers });
    const req = opts.req;
    const user = (session as (Session & { user?: { id: string; role?: string; disabledAt?: number | null } }) | null)?.user;
    if (!user?.id || user.disabledAt != null) return reply({ error: "Unauthorized" }, 401);
    if (!["GET", "POST"].includes(req.method)) return new Response(null, { status: 405, headers: { ...headers, Allow: "GET, POST" } });
    if (user.role !== "owner") return reply({ error: "Only owners can manage voice dictation" }, 403);
    // Fixed public texts per code: SDK errors are already secret-free, but a route string can embed a credential-bearing
    // URL, so route failures are never echoed and unknown failures get a generic sentence.
    const fail = (error: unknown) => {
        const e = (error && typeof error === "object" ? error : {}) as { status?: unknown; code?: unknown; field?: unknown; message?: unknown };
        const status = typeof e.status === "number" && e.status >= 400 && e.status < 500 ? e.status : 422;
        const code = typeof e.code === "string" ? e.code : undefined;
        const known = code === "VALIDATION" || code === "NOT_FOUND" || code === "UNKNOWN_PROVIDER" || code === "SETTING_FIXED";
        const message = code === "routeUnavailable" || code === "unconfigured" ? "This voice route is not available; choose a voice model."
            : code === "SETTING_FIXED" ? "The default voice route is fixed by an instance settings file."
            : known && typeof e.message === "string" && !/secret:\/\//.test(e.message) ? e.message.slice(0, 300)
            : "Voice settings request failed";
        return reply({ error: message, ...(code ? { code } : {}), ...(typeof e.field === "string" ? { field: e.field.slice(0, 64) } : {}) }, status);
    };
    const routes = async () => {
        const providers = ctx.fns.voice.providers({});
        const connections = await ctx.fns.voice.list({});
        const out: { route: string; provider: string; accountName: string; connectionId: string; modelId: string; label: string; description?: string; destination: types.voice.Destination }[] = [];
        for (const connection of connections) {
            const provider = providers.find(p => p.id === connection.provider);
            if (!provider || !connection.providerRegistered) continue;
            for (const model of provider.models) {
                let route: string;
                try { route = ctx.fns.voice.route.formatRoute({ provider: provider.id, accountName: connection.accountName, modelId: model.id }); } catch { continue; }
                out.push({
                    route, provider: provider.id, accountName: connection.accountName, connectionId: connection.id, modelId: model.id,
                    label: model.label || model.id, ...(model.description ? { description: model.description } : {}), destination: connection.destination ?? provider.destination,
                });
            }
        }
        return { providers, connections, routes: out };
    };
    // Saved route choices for the transport selector: names and endpoints only, never credentials.
    const infrastructureView = async () => {
        const [proxies, instances] = await Promise.all([
            ctx.fns.socksProxy.list({}).catch(() => []),
            ctx.fns.sshInstance.list({}).catch(() => []),
        ]);
        return {
            proxies: proxies.map(p => ({ id: p.id, name: p.name, host: p.host, port: p.port })),
            instances: instances.filter(i => !!i.pinnedHostKey).map(i => i.name),
        };
    };
    const defaultRoute = async () => {
        const fixed = !!(await ctx.fns.settings.files({})).values["voice.defaultRoute"];
        const value = await ctx.fns.settings.get({ module: "voice", scopeType: "global", key: "defaultRoute" });
        return { route: typeof value === "string" ? value : "", fixed };
    };
    // Same rule as the live endpoint: the chat must be created by this enabled owner; edits need an open chat.
    const chatAccess = async (agentId: string): Promise<"edit" | "readOnly" | null> => {
        if (!agentId || agentId.length > 200) return null;
        const rows = await ctx.fns.procs.db.select({
            sql: `SELECT a.archived_at FROM agents a JOIN users u ON u.id = a.created_by
                  WHERE a.id = ? AND u.id = ? AND u.role = 'owner' AND u.disabled_at IS NULL`,
            params: [agentId, user.id],
        });
        return !rows[0] ? null : rows[0].archived_at == null ? "edit" : "readOnly";
    };
    const chatView = async (agentId: string) => {
        const effective = await ctx.fns.voice.effectiveRoute({ agentId });
        if (!effective.route) return { agentId, route: "", source: effective.source, status: "unconfigured" as const };
        try {
            const resolved = await ctx.fns.voice.resolveRoute({ route: effective.route });
            return {
                agentId, route: effective.route, source: effective.source, status: "ready" as const, destination: resolved.destination,
                model: { id: resolved.model.id, label: resolved.model.label || resolved.model.id, ...(resolved.model.description ? { description: resolved.model.description } : {}) },
            };
        } catch (error) {
            const reason = typeof (error as { reason?: unknown })?.reason === "string" ? (error as { reason: string }).reason : "unknown";
            return { agentId, route: effective.route, source: effective.source, status: "unavailable" as const, reason };
        }
    };
    const requireRoute = async (value: unknown) => {
        if (typeof value !== "string" || !value) throw Object.assign(new Error("Route required"), { code: "VALIDATION", status: 400, field: "route" });
        await ctx.fns.voice.resolveRoute({ route: value });
        return value;
    };

    if (req.method === "GET") {
        try {
            const agentId = new URL(req.url).searchParams.get("agentId") ?? "";
            if (agentId && !await chatAccess(agentId)) return reply({ error: "Chat not found" }, 404);
            const [catalogue, fallback, infrastructure] = await Promise.all([routes(), defaultRoute(), infrastructureView()]);
            return reply({
                ...catalogue,
                ...infrastructure,
                defaultRoute: fallback,
                ...(agentId ? { chat: await chatView(agentId) } : {}),
                csrfToken: await ctx.fns.auth.csrfToken({ req }),
            });
        } catch (error) { return fail(error); }
    }

    if (req.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Same origin required" }, 403);
    const origin = req.headers.get("origin");
    if (origin !== null && origin !== await ctx.fns.http.publicOrigin({ req })) return reply({ error: "Same origin required" }, 403);
    if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get("x-csrf-token") || "" })) return reply({ error: "Invalid request token" }, 403);
    if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply({ error: "JSON body required" }, 415);
    const MAX_BODY = 65536;
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return reply({ error: "Request too large" }, 413);
    // Bounded streaming read: a missing or false Content-Length cannot make the server buffer an unbounded body.
    // Reading stops (and the stream is cancelled) at the first chunk that crosses the limit.
    let bytes: Uint8Array;
    {
        const reader = req.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        let tooLarge = false;
        try {
            while (reader) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.byteLength;
                if (size > MAX_BODY) { tooLarge = true; break; }
                chunks.push(value);
            }
        } catch {
            return reply({ error: "Invalid request body" }, 400);
        } finally {
            if (tooLarge) await reader?.cancel().catch(() => {});
            else try { reader?.releaseLock(); } catch { /* Nothing pending; the request is finished either way. */ }
        }
        if (tooLarge) return reply({ error: "Request too large" }, 413);
        bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    }
    let data: Record<string, unknown>;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: "Invalid JSON" }, 400); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return reply({ error: "Invalid request" }, 400);
    const record = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
    const id = typeof data.id === "string" ? data.id : "";
    const agentId = typeof data.agentId === "string" ? data.agentId : "";
    try {
        switch (data.action) {
            case "create": {
                if (typeof data.provider !== "string") return reply({ error: "Provider required", field: "provider" }, 400);
                const connection = await ctx.fns.voice.create({
                    provider: data.provider,
                    accountName: typeof data.accountName === "string" ? data.accountName : "",
                    config: record(data.config) ?? {},
                    secrets: (record(data.secrets) ?? {}) as Record<string, string | null>,
                    ...(data.transport !== undefined ? { transport: data.transport as types.voice.TransportSpec } : {}),
                });
                return reply({ connection }, 201);
            }
            case "update": {
                const connection = await ctx.fns.voice.update({
                    id,
                    ...(typeof data.accountName === "string" ? { accountName: data.accountName } : {}),
                    ...(record(data.config) ? { config: record(data.config) } : {}),
                    ...(record(data.secrets) ? { secrets: record(data.secrets) as Record<string, string | null> } : {}),
                    ...(data.transport !== undefined ? { transport: data.transport as types.voice.TransportSpec } : {}),
                });
                return reply({ connection });
            }
            case "remove":
                if (data.confirmed !== true) return reply({ error: "Removal must be confirmed", field: "confirmed" }, 400);
                return reply(await ctx.fns.voice.remove({ id }));
            case "test": return reply({ result: await ctx.fns.voice.test({ id }) });
            case "setDefaultRoute": {
                if (data.route === "") {
                    if ((await defaultRoute()).fixed) throw Object.assign(new Error("fixed"), { code: "SETTING_FIXED", status: 409 });
                    await ctx.fns.settings.remove({ module: "voice", scopeType: "global", key: "defaultRoute" });
                } else {
                    const route = await requireRoute(data.route);
                    await ctx.fns.settings.set({ module: "voice", scopeType: "global", key: "defaultRoute", value: route });
                }
                return reply({ defaultRoute: await defaultRoute() });
            }
            case "setChatRoute":
            case "clearChatRoute": {
                const access = await chatAccess(agentId);
                if (!access) return reply({ error: "Chat not found" }, 404);
                if (access !== "edit") return reply({ error: "Restore this archived chat before making changes", code: "readOnly" }, 409);
                if (data.action === "setChatRoute") await ctx.fns.voice.route.setOverride({ agentId, route: await requireRoute(data.route) });
                else await ctx.fns.voice.route.clearOverride({ agentId });
                return reply({ chat: await chatView(agentId) });
            }
            default: return reply({ error: "Unknown action" }, 400);
        }
    } catch (error) { return fail(error); }
}
