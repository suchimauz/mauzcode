/**
 * List the static, dated Gemini Code Assist model set without network access
 *
 * listModels adapter of the gemini provider. Code Assist has no model list endpoint, so this returns the versioned list from models.provider.gemini.constants with labels, an image-input note and the reasoning profile per model; context and output limits come from the public `google` catalogue (inference.catalog.modelsDev). Sends no request and needs no login.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<types.models.ModelInfo[]> {
    const k = ctx.fns.models.provider.gemini.constants({});
    return k.models.map(m => {
        const r = ctx.fns.models.provider.gemini.reasoningProfile({ model: m.id });
        return {
            id: m.id, label: m.label,
            ...(m.imageInput ? { description: "Accepts image input" } : {}),
            ...(r ? { reasoning: { supported: [...r.supported], ...(r.wire ? { wire: { ...r.wire } } : {}), ...(r.disable ? { disable: true } : {}) } } : {}),
        };
    });
}
