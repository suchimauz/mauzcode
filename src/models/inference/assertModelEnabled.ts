/**
 * Reject inference for a globally disabled provider, a disabled model or a disabled model connection
 *
 * Gate called by models.stream and models.compact before any provider code runs. Checks the global provider switch first (models.inference.assertProviderEnabled; code PROVIDER_DISABLED wins over connection and model checks and over NOT_FOUND), then reads the stored connection on every call without caching, so a session already using a model fails on its very next request after the owner disables it. Throws `Model <model> is disabled by user` with code MODEL_DISABLED_BY_USER, retryable:false, replaySafe:false; a disabled connection throws code CONNECTION_DISABLED; unknown connections throw NOT_FOUND.
 * @param opts.id Connection UUID.
 * @param opts.model Provider-native model id requested for inference.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Provider-native model id requested for inference. */
        model: string;
    },
): Promise<types.models.ConnectionView> {
    const view = await ctx.fns.models.connections.get({ id: opts.id });
        await ctx.fns.models.inference.assertProviderEnabled({ provider: view.provider });
        const model = String(opts.model ?? "");
        if (!view.enabled) throw Object.assign(new Error("Connection " + view.accountName + " is disabled"), { code: "CONNECTION_DISABLED", status: 409, retryable: false, replaySafe: false });
        if (view.disabledModels.includes(model)) throw Object.assign(new Error("Model " + model + " is disabled by user"), { code: "MODEL_DISABLED_BY_USER", status: 409, retryable: false, replaySafe: false });
        return view;
}
