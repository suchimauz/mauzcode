/**
 * Look up public USD prices per million tokens for model routes
 *
 * Public facade of models.catalog.tokenPrice. Routes whose provider declares no price vendor, or whose model the vendor catalogue does not list, map to null; other routes are still priced.
 * @param opts.routes Exact provider/accountName:modelId routes to price.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact provider/accountName:modelId routes to price. */
        routes: string[];
    },
): Promise<Record<string, types.models.TokenPrice | null>> {
    return ctx.fns.models.catalog.tokenPrice(opts);
}
