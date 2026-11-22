/**
 * Return authenticated read-only model choices and agent reasoning settings
 *
 * Use for the React model selector on the authenticated MauzCode origin. Preserves full native model routes and disabled policy, with inert provider icons and current persisted reasoning preferences. Does not change agents or credentials.
 * @param opts.agentId Existing unarchived agent identifier, one to 128 ASCII letters, digits, underscores or hyphens.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing unarchived agent identifier, one to 128 ASCII letters, digits, underscores or hyphens. */
        agentId: string;
    },
): Promise<{ version: 1; agentId: string; model: string; label: string; icon: {src:string;custom:boolean}|null; running: boolean; defaultModel: string; models: Array<{provider:string;model:string;label:string;groupLabel?:string;connectionId?:string;disabled:boolean;icon:{src:string;custom:boolean}|null}>; groups: Array<{connectionId:string;provider:string;accountName:string;enabled:boolean;unavailable:boolean}>; effort: ReturnType<Context["fns"]["frontendBridge"]["modelEffort"]> }> {
    if (!(session as Session & {user?:{id:string}})?.user) throw new Error("Unauthorized");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(opts.agentId)) throw new Error("Invalid agentId");
    const rows = await ctx.fns.procs.db.select({sql:"SELECT id, model, reasoning_effort, run_state FROM agents WHERE id = ? AND archived_at IS NULL",params:[opts.agentId]});
    const row = rows[0];
    if (!row) throw new Error("Agent not found");
    const currentModel = String(row.model ?? "");
    const requested = String(row.reasoning_effort ?? "auto");
    const catalogue = await ctx.fns.frontendBridge.modelCatalogue({});
    const models = await Promise.all(catalogue.models.map(async ({reasoning:_r,...option})=>({...option,icon:await ctx.fns.frontendBridge.iconData({model:option.model})})));
    const current = catalogue.models.find(m=>m.model===currentModel);
    // The stored selection is shown as is; an unavailable or empty model is never replaced by a default here.
    const last = String((await ctx.fns.procs.db.select({sql:"SELECT value FROM kv WHERE key=?",params:["last-model"]}))[0]?.value ?? "");
    const enabledDefault = models.find(m => !m.disabled && m.model === last)?.model ?? "";
    const live = ctx.state.agent?.[opts.agentId];
    return {version:1,agentId:opts.agentId,model:currentModel,label:current?.label??(currentModel?(await ctx.fns.models.displayNames({routes:[currentModel],labels:{},offline:true}))[currentModel]??currentModel:""),icon:currentModel?await ctx.fns.frontendBridge.iconData({model:currentModel}):null,running:row.run_state==="running" || Number(live?.activeRunCount ?? 0)>0,defaultModel:enabledDefault,models,groups:catalogue.groups,effort:ctx.fns.frontendBridge.modelEffort({reasoning:current?.reasoning??null,requested})};
}
