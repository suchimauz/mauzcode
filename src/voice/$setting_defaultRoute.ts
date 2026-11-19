// Voice route grammar for the persisted default-route setting (task 1.3): validation only, storage stays in
// `settings`. The effective choice for one chat is voice.effectiveRoute; resolution and availability checks are
// voice.resolveRoute.
export default {
    type: "string" as const,
    default: "",
    title: "Default voice route",
    description: "provider/accountName:modelId voice route used by chats without their own override. Empty means voice dictation is not configured.",
    /** Rejects anything but an empty value or a syntactically valid voice route; called by settings.set. */
    validate(ctx: Context, value: unknown): void {
        if (value === "" || value == null) return;
        if (typeof value !== "string") throw Object.assign(new Error("voice.defaultRoute must be a provider/accountName:modelId route"), { code: "INVALID_SETTING" });
        try { ctx.fns.voice.route.parseRoute({ route: value }); }
        // Fixed text: a rejected value can embed a credential-bearing URL, so it is never echoed back.
        catch { throw Object.assign(new Error("voice.defaultRoute must be a valid provider/accountName:modelId route"), { code: "INVALID_SETTING" }); }
    },
};
