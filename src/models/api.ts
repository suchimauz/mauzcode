/**
 * Owner-only HTTP API for model providers and connections
 *
 * Backs GET/POST /models/api for the Models settings tab. GET returns the provider catalogue as ProviderSettingsView[] (declaration metadata plus effective `enabled` from models.disabledProviders and `enabledLocked` when the setting is fixed by an instance file, computed per request), secret-free connections, inert provider logos (`providerLogos` by provider id from frontendBridge.modelMark: brand marks, the generic plug for `custom`, null only when resolution fails), saved SOCKS proxies, trusted SSH instance names and a cookie-bound CSRF token. POST takes one JSON object `{ action, ... }` (action `models` returns every model with the shared display name in `label`, for all providers) with action `providers` (same ProviderSettingsView[] as GET), `list`, `get`, `create`, `update`, `remove`, `test`, `models` (cached list; `refresh: true` asks the provider and updates the cache), `usage`, `setProviderEnabled` (`{ provider, enabled }`, registered provider id + boolean; serialized read-modify-write of the global models.disabledProviders setting, idempotent, connections untouched; returns `{ providers }`; a file-fixed setting fails 409 SETTING_FIXED with `fixedBy`), `setModelEnabled` (`{ id, model, enabled }`, returns the updated connection), `setContextLimits` (`{ id, limits: { [model]: tokens | null } }`, atomic owner context-window override patch, returns `{ overrides, limits }`) or `action`; the `models` reply also carries `contextOverrides` (all stored overrides, including absent models) and `contextLimits` (effective limit, provider value, override and source per listed model); it requires same origin, a valid `x-csrf-token`, `application/json` and at most 64 KiB. Non-owners get 403, anonymous 401. Responses never contain secret values or references.
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
    if (!user || user.disabledAt != null) return reply({ error: "Unauthorized" }, 401);
    if (!["GET", "POST"].includes(req.method)) return new Response(null, { status: 405, headers: { ...headers, Allow: "GET, POST" } });
    if (user.role !== "owner") return reply({ error: "Only owners can manage model connections" }, 403);
    const fail = (error: unknown) => {
        const e = error as { status?: unknown; code?: unknown; field?: unknown; fixedBy?: unknown } | null;
        const status = typeof e?.status === "number" && e.status >= 400 && e.status < 500 ? e.status : e?.code === "TRANSPORT" ? 400 : 422;
        return reply({ error: ctx.fns.models.connections.safeMessage({ message: error, fallback: "Model connection request failed" }), ...(typeof e?.code === "string" ? { code: e.code } : {}), ...(typeof e?.field === "string" ? { field: e.field } : {}), ...(typeof e?.fixedBy === "string" ? { fixedBy: e.fixedBy } : {}) }, status);
    };
    // Effective enablement per request: the declaration catalogue stays synchronous; only this projection reads state.
    const providerViews = async (): Promise<types.models.ProviderSettingsView[]> => {
        const [disabled, files] = await Promise.all([ctx.fns.models.disabledProviders({}), ctx.fns.settings.files({})]);
        const locked = !!files.values["models.disabledProviders"];
        return ctx.fns.models.providers({}).map(p => ({ ...p, enabled: !disabled.has(p.id), enabledLocked: locked }));
    };
    if (req.method === "GET") {
        try {
            const [connections, proxies, instances] = await Promise.all([
                ctx.fns.models.connections.list({}),
                ctx.fns.socksProxy.list({}).catch(() => []),
                ctx.fns.sshInstance.list({}).catch(() => []),
            ]);
            // Inert marks from the shared resolver: brand for known providers, the generic plug for custom.
            const providers = await providerViews();
            const providerLogos = Object.fromEntries(await Promise.all(providers.map(async p => {
                try { return [p.id, await ctx.fns.frontendBridge.modelMark({ provider: p.id })] as const; } catch { return [p.id, null] as const; }
            })));
            return reply({
                providers,
                providerLogos,
                connections,
                proxies: proxies.map(p => ({ id: p.id, name: p.name, host: p.host, port: p.port })),
                instances: instances.filter(i => !!i.pinnedHostKey).map(i => i.name),
                csrfToken: await ctx.fns.auth.csrfToken({ req }),
            });
        } catch (error) { return fail(error); }
    }
    if (req.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Same origin required" }, 403);
    const origin = req.headers.get("origin");
    if (origin !== null && origin !== await ctx.fns.http.publicOrigin({ req })) return reply({ error: "Same origin required" }, 403);
    if (!await ctx.fns.auth.verifyCsrf({ req, token: req.headers.get("x-csrf-token") || "" })) return reply({ error: "Invalid request token" }, 403);
    if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return reply({ error: "JSON body required" }, 415);
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > 65536) return reply({ error: "Request too large" }, 413);
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength > 65536) return reply({ error: "Request too large" }, 413);
    let data: Record<string, unknown>;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: "Invalid JSON" }, 400); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return reply({ error: "Invalid request" }, 400);
    const id = typeof data.id === "string" ? data.id : "";
    const record = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
    const optional = <T>(key: string): T | undefined => Object.hasOwn(data, key) ? data[key] as T : undefined;
    try {
        switch (data.action) {
            case "providers": return reply({ providers: await providerViews() });
            case "setProviderEnabled": {
                const provider = typeof data.provider === "string" ? data.provider.trim() : "";
                if (!provider || !Object.hasOwn(ctx.state.models?.providers ?? {}, provider)) return reply({ error: "Unknown provider", field: "provider" }, 400);
                if (typeof data.enabled !== "boolean") return reply({ error: "enabled must be true or false", field: "enabled" }, 400);
                const enabled = data.enabled;
                // Single-process mutex in ctx.state.models: serialize read-modify-write so concurrent toggles are not lost.
                const st = (ctx.state.models ??= {});
                const write = async () => {
                    const disabled = await ctx.fns.models.disabledProviders({});
                    if (enabled) disabled.delete(provider); else disabled.add(provider);
                    await ctx.fns.settings.set({ module: "models", scopeType: "global", key: "disabledProviders", value: [...disabled] });
                };
                const prev = st.disabledProvidersQueue ?? Promise.resolve();
                const run = prev.then(write, write);
                // Recover the stored tail so a rejected write cannot poison later toggles; the caller still gets the original rejection.
                st.disabledProvidersQueue = run.catch(() => undefined);
                await run;
                return reply({ providers: await providerViews() });
            }
            case "list": return reply({ connections: await ctx.fns.models.connections.list({ ...(typeof data.provider === "string" ? { provider: data.provider } : {}) }) });
            case "get": return reply({ connection: await ctx.fns.models.connections.get({ id }) });
            case "create": {
                if (typeof data.provider !== "string") return reply({ error: "Provider required", field: "provider" }, 400);
                const connection = await ctx.fns.models.connections.create({
                    provider: data.provider,
                    accountName: typeof data.accountName === "string" ? data.accountName : "",
                    config: record(data.config) ?? {},
                    secrets: (record(data.secrets) ?? {}) as Record<string, string | null>,
                    ...(record(data.transport) ? { transport: data.transport as types.models.TransportSpec } : {}),
                    ...(typeof data.enabled === "boolean" ? { enabled: data.enabled } : {}),
                });
                return reply({ connection }, 201);
            }
            case "update": {
                const connection = await ctx.fns.models.connections.update({
                    id,
                    ...(optional<string>("accountName") !== undefined ? { accountName: data.accountName as string } : {}),
                    ...(record(data.config) ? { config: data.config as Record<string, unknown> } : {}),
                    ...(record(data.secrets) ? { secrets: data.secrets as Record<string, string | null> } : {}),
                    ...(record(data.transport) ? { transport: data.transport as types.models.TransportSpec } : {}),
                    ...(optional<boolean>("enabled") !== undefined ? { enabled: data.enabled as boolean } : {}),
                });
                return reply({ connection });
            }
            case "remove": {
                if (data.confirmed !== true) return reply({ error: "Confirm removal before continuing" }, 400);
                return reply(await ctx.fns.models.connections.remove({ id }));
            }
            case "setModelEnabled": {
                if (typeof data.enabled !== "boolean") return reply({ error: "enabled must be true or false", field: "enabled" }, 400);
                return reply({ connection: await ctx.fns.models.catalog.setModelEnabled({ id, model: typeof data.model === "string" ? data.model : "", enabled: data.enabled }) });
            }
            case "setContextLimits": {
                const limits = data.limits;
                if (!limits || typeof limits !== "object" || Array.isArray(limits)) return reply({ error: "limits must be an object of model id → tokens or null", field: "limits" }, 400);
                return reply(await ctx.fns.models.catalog.setContextLimits({ id, limits: limits as Record<string, number | null> }));
            }
            case "test": return reply({ result: await ctx.fns.models.connections.test({ id }) });
            case "models": {
                // Every provider's list carries the shared display name (provider label, else models.dev, else prettified id), like the pickers.
                const list = await ctx.fns.models.catalog.listModels({ id, refresh: data.refresh === true });
                let view: types.models.ConnectionView | null = null;
                try { view = await ctx.fns.models.connections.get({ id }); } catch { view = null; /* names are cosmetic; keep the plain list */ }
                // Owner context overrides and each model's effective limit; overrides of absent models are kept and returned too.
                const overrides = await ctx.fns.models.catalog.contextOverrides({ id });
                let catalog: Awaited<ReturnType<typeof ctx.fns.models.catalog.catalogLimits>> = {};
                if (view) try { catalog = await ctx.fns.models.catalog.catalogLimits({ provider: view.provider, models: list.models.filter(m => m.contextWindow == null).map(m => m.id) }); } catch { catalog = {}; /* catalogues are optional defaults */ }
                const contextLimits = Object.fromEntries(list.models.map(m => [m.id, ctx.fns.models.catalog.contextLimit({ provider: m.contextWindow ?? null, override: overrides[m.id] ?? null, catalog: catalog[m.id]?.context ?? null })]));
                if (!view || !list.models.length) return reply({ ...list, contextOverrides: overrides, contextLimits });
                const conn = view;
                const route = (model: string) => conn.provider + "/" + conn.accountName + ":" + model;
                const labels = Object.fromEntries(list.models.filter(m => m.label?.trim()).map(m => [route(m.id), m.label!.trim()]));
                let names: Record<string, string> = {};
                try { names = await ctx.fns.models.catalog.displayNames({ routes: list.models.map(m => route(m.id)), labels }); } catch { names = {}; /* fall back to provider labels */ }
                return reply({ ...list, models: list.models.map(m => ({ ...m, label: names[route(m.id)] || m.label })), contextOverrides: overrides, contextLimits });
            }
            case "usage": return reply({ usage: await ctx.fns.models.connections.usage({ id, refresh: data.refresh === true }) });
            case "action": {
                if (typeof data.name !== "string" || !data.name) return reply({ error: "Action name required" }, 400);
                return reply({ result: await ctx.fns.models.connections.action({ id, action: data.name, input: (data.input ?? null) as types.models.ActionValue }) });
            }
            default: return reply({ error: "Unknown action" }, 400);
        }
    } catch (error) { return fail(error); }
}
