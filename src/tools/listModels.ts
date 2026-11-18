/**
 * Native `list_models` adapter: the model routes this agent may be given to a delegated child.
 *
 * Binds no authority from arguments and adds none: forwards the optional provider and limit filters to
 * `models.selectable`, which reads stored connections and cached catalogues only — no provider request, no
 * secret values. The result is the exact `provider/accountName:modelId` grammar every delegating entry point
 * (`agent.delegate`, `session.fork`, `sharedAgent.delegate`, `delegate_task`) accepts, together with the
 * reasoning levels each model supports; this adapter never validates or applies a choice.
 * @param opts.provider Only routes of this provider id.
 * @param opts.limit Maximum rows to return; every other filter still applies first. @default 200
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Only routes of this provider id. */
        provider?: string;
        /** Maximum rows to return; every other filter still applies first. @default 200 */
        limit?: number;
    } = {},
): Promise<{ models: Array<{ route: string; label: string; reasoning: types.models.ReasoningLevel[] }>; total: number }> {
    const unknown = Object.keys(opts ?? {}).filter(key => !["provider", "limit"].includes(key));
    if (unknown.length) throw new Error(`list_models: unknown argument ${unknown.join(", ")}`);
    if (opts.provider !== undefined && (typeof opts.provider !== "string" || !opts.provider.trim())) throw new Error("list_models: provider must be a non-empty provider id");
    return ctx.fns.models.selectable({
        ...(opts.provider !== undefined ? { provider: opts.provider.trim() } : {}),
        ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    });
}
