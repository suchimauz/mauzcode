/**
 * Reject any provider use while the provider is globally disabled
 *
 * Central admission gate for every network path of the models stack: inference (through models.assertModelEnabled), route resolution, provider actions and connection creation. Reads models.disabledProviders through settings on every call without caching; a disabled provider throws `Provider <id> is disabled` with code PROVIDER_DISABLED, status 409, retryable:false, replaySafe:false, before any provider code, credential resolution or network request. Operations admitted before the disable write may finish; existing streams are not cancelled.
 * @param opts.provider Registered provider id.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Registered provider id. */
        provider: string;
    },
): Promise<void> {
    const disabled = await ctx.fns.models.disabledProviders({});
    if (disabled.has(opts.provider))
        throw Object.assign(new Error("Provider " + opts.provider + " is disabled"), { code: "PROVIDER_DISABLED", status: 409, retryable: false, replaySafe: false });
}