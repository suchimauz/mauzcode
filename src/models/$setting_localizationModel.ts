// Model route for background retrieval-text localization (docs and plugins).
export default {
    type: "string" as const,
    default: "",
    title: "Localization model",
    description: "provider/accountName:modelId route used to generate multilingual retrieval text. Empty uses the model chosen without a default setting (last used, else first enabled model).",
    /** Rejects anything but an empty value or a valid models route; called by settings.set. */
    validate(ctx: Context, value: unknown): void {
        if (value === "" || value == null) return;
        if (typeof value !== "string") throw Object.assign(new Error("models.localizationModel must be a provider/accountName:modelId route"), { code: "INVALID_SETTING" });
        try { ctx.fns.models.inference.parseRoute({ route: value.trim() }); }
        catch { throw Object.assign(new Error(`models.localizationModel: ${value} is not a valid provider/accountName:modelId route`), { code: "INVALID_SETTING" }); }
    },
};
