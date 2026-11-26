/**
 * Disable or re-enable one model id on a model connection
 *
 * Owner operation behind the Models tab model switches. Atomically adds or removes the model id in the connection's disabled set (idempotent), bumps updatedAt and emits the llm-models refresh topic. Disabled models stay listed but models.stream and models.compact refuse them. Does not touch legacy llm.modelPolicy routes. Fails with VALIDATION for an empty, whitespace-containing or over-200-character model id and NOT_FOUND for an unknown connection.
 * For providers declaring `capabilities.groupAvailability` (Antigravity) a variant group is configured as one model: a native member id of a group in the connection's cached catalogue fails VALIDATION (field `model`, `group` naming the group id) with no write; enabling a group id also removes the stale disables of its proven members in the same locked update, so all its provider-eligible levels return at once; disabling a group stores only the group id. Without a trustworthy cached mapping only the given id changes. Standalone models and other providers behave as before.
 * @param opts.id Connection UUID.
 * @param opts.model Provider-native model id, 1–200 characters without whitespace.
 * @param opts.enabled True re-enables the model, false disables it.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Provider-native model id, 1–200 characters without whitespace. */
        model: string;
        /** True re-enables the model, false disables it. */
        enabled: boolean;
    },
): Promise<types.models.ConnectionView> {
    const model = typeof opts.model === "string" ? opts.model : "";
            if (!/^\S{1,200}$/.test(model)) throw Object.assign(new Error("Model id must be 1–200 characters without whitespace"), { code: "VALIDATION", field: "model", status: 400 });
            if (typeof opts.enabled !== "boolean") throw Object.assign(new Error("enabled must be true or false"), { code: "VALIDATION", field: "enabled", status: 400 });
            const view = await ctx.fns.models.connections.get({ id: opts.id });
            const def = Object.hasOwn(ctx.state.models?.providers ?? {}, view.provider) ? ctx.state.models!.providers![view.provider]!.definition : undefined;
            const grouped = def?.capabilities?.groupAvailability === true;
            await ctx.fns.procs.db.transaction({ fn: async () => {
                // The row lock serializes against conversion passes, refresh publications and concurrent edits.
                const [row] = await ctx.fns.procs.db.select({ sql: "SELECT disabled_models, updated_at FROM llm_connections WHERE id=? FOR UPDATE", params: [view.id] }) as { disabled_models: string[]; updated_at: string | number }[];
                if (!row) throw Object.assign(new Error("Connection not found"), { code: "NOT_FOUND", status: 404 });
                const stored = Array.isArray(row.disabled_models) ? row.disabled_models : [];
                let clear: string[] = [];
                if (grouped) {
                    const catalogue = await ctx.fns.models.catalog.listModels({ id: view.id, cacheOnly: true });
                    const groups = catalogue.source === "provider" ? ctx.fns.models.catalog.effectiveDisabled({ models: catalogue.models, disabled: stored }).groups : {};
                    const owner = Object.entries(groups).find(([, g]) => g.members.includes(model))?.[0];
                    if (owner !== undefined) throw Object.assign(new Error(`Model ${model} is a reasoning level of group ${owner}; enable or disable the group ${owner} instead`), { code: "VALIDATION", field: "model", group: owner, status: 400 });
                    if (opts.enabled && Object.hasOwn(groups, model)) clear = groups[model]!.members;
                }
                const next = new Set(stored);
                if (opts.enabled) { next.delete(model); for (const member of clear) next.delete(member); }
                else next.add(model);
                const now = Math.max(Date.now(), Number(row.updated_at) + 1);
                await ctx.fns.procs.db.run({ sql: "UPDATE llm_connections SET disabled_models = ?::text[], updated_at = ? WHERE id = ?", params: [[...next], now, view.id] });
            } });
            try { await ctx.fns.procs.events.refresh({ topic: "llm-models", reason: "models-model-enabled" }); } catch (error) { ctx.fns.procs.log.debug({ event: "models.refresh", msg: String(error) }); }
            return ctx.fns.models.connections.get({ id: view.id });
}
