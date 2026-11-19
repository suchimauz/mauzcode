/**
 * Format a validated voice route from its exact parts without losing separators
 *
 * Use to rebuild a parsed route or construct one from a registered provider, a stored account name and a native
 * model id. Provider and account name may not contain a slash or colon (account spaces are kept); every slash or
 * colon after the first two separators stays inside the native model id. The rebuilt string is checked by
 * parseRoute, so the result always round-trips.
 * @param opts.provider Registered provider identifier.
 * @param opts.accountName Exact account name without slash or colon separators.
 * @param opts.modelId Native model identifier, including slash or colon characters.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Registered provider identifier. */
        provider: string;
        /** Exact account name without slash or colon separators. */
        accountName: string;
        /** Native model identifier, including slash or colon characters. */
        modelId: string;
    },
): string {
    if (/[/:]/.test(opts.provider) || /[/:]/.test(opts.accountName)) {
        throw ctx.fns.voice.route.failure({
            message: "Voice route components must not contain / or :",
            reason: "invalid-route",
        });
    }
    const route = `${opts.provider}/${opts.accountName}:${opts.modelId}`;
    ctx.fns.voice.route.parseRoute({ route });
    return route;
}
