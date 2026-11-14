/**
 * Resolve a model route through the public models facade without network access
 *
 * Use outside models to resolve current connection identity, descriptors, native compaction and cached model limits. Forwards options unchanged to the single internal implementation and preserves its result and failure semantics.
 * @param opts.route Exact provider/accountName:modelId route selected by the owner.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact provider/accountName:modelId route selected by the owner. */
        route: string;
    },
): Promise<types.models.ResolvedRoute> {
    return ctx.fns.models.inference.resolveRoute(opts);
}
