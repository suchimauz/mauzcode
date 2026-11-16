// Provider ids the owner disabled for the whole instance: their models are hidden and every network path refuses them.
export default {
    type: "json" as const,
    default: [] as string[],
    title: "Disabled model providers",
    description: "JSON array of provider ids taken out of service instance-wide. Their connections and secrets are kept, but inference, provider actions, tests, usage and discovery are refused and their models are hidden from pickers. Ids of unregistered providers are kept and take effect when the provider loads.",
    /** Shape only — never registration: an unloaded plugin provider must stay stored. Called by settings.set. */
    validate(_ctx: Context, value: unknown): void {
        if (!Array.isArray(value) || value.some(id => typeof id !== "string" || !id.trim()))
            throw Object.assign(new Error("models.disabledProviders must be an array of non-empty provider id strings"), { code: "INVALID_SETTING", status: 400 });
    },
};