/**
 * Choose the model route used for retrieval-text localization
 *
 * Returns the models.localizationModel setting when set, otherwise the model chosen by settings.modelDefault. An explicit value is returned as is, never replaced by another model; resolution errors surface when it is used.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string> {
    const configured = String(await ctx.fns.settings.getString({ module: "models", scopeType: "global", key: "localizationModel", fallback: "" }) ?? "").trim();
    return configured || await ctx.fns.settings.modelDefault({});
}
