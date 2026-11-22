/**
 * Resolve human-readable display names for model routes
 *
 * Public facade of models.catalog.displayNames for UI projections outside src/models. Names come from the connection catalogue label, then the cached models.dev snapshot, then a prettified id; display only, never used for routing.
 * @param opts.routes Model routes provider/accountName:modelId (or bare ids) to name; every input appears as a key in the result.
 * @param opts.offline Read local label snapshots only; never hydrate models.dev.
 * @param opts.labels Complete catalogue labels by route, supplied by a caller that already read the catalogues; when present the connection cache is not read.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Model routes provider/accountName:modelId (or bare ids) to name; every input appears as a key in the result. */
        routes: string[];
        /** Complete catalogue labels by route, supplied by a caller that already read the catalogues; when present the connection cache is not read. */
        labels?: Record<string, string>;
        /** Never start external catalogue hydration, even on a cold cache. */
        offline?: boolean;
    },
): Promise<Record<string, string>> {
    return ctx.fns.models.catalog.displayNames(opts);
}
