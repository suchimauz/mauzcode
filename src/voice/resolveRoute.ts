/**
 * Resolve a voice route against current state without network or secrets
 *
 * Use through the public voice facade to obtain connection identity, destination disclosure, the catalogued
 * model and the negotiated sample rate for an exact `<provider>/<accountName>:<modelId>` route. A failure
 * throws `code: "routeUnavailable"` with a closed local `reason` and no provider text: an unavailable route is
 * reported, never replaced by another one.
 * @param opts.route Exact provider/accountName:modelId route selected by the owner.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact provider/accountName:modelId route selected by the owner. */
        route: string;
    },
): Promise<types.voice.ResolvedRoute> {
    return ctx.fns.voice.route.resolveRoute(opts);
}
