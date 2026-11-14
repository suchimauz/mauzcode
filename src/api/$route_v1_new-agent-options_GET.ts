/** Returns model and workspace defaults for the native new-agent form, built from stored model connections. */
export default async function (ctx: Context, _session: Session | null, _opts: { req: Request; params: Record<string, string> }) {
    const [catalogue, defaultModel, agents] = await Promise.all([
        ctx.fns.frontendBridge.modelCatalogue({}),
        ctx.fns.settings.modelDefault({}).catch(() => ""),
        ctx.fns.session.list({ includeArchived: true }),
    ]);
    const models = catalogue.models.map(({ provider, model, label, groupLabel, disabled }) => ({ provider, model, label, groupLabel, disabled }));
    const enabledDefault = models.find(model => !model.disabled && model.model === defaultModel)?.model
        ?? models.find(model => !model.disabled)?.model ?? "";
    const workspaces = Array.from(new Set(agents.map(agent => agent.workspaceDir).filter(Boolean))).sort();
    return Response.json({ version: 1, defaultModel: enabledDefault, models, groups: catalogue.groups, workspaces });
}
