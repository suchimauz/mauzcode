/**
 * Format a validated provider account model route without losing separators
 *
 * Use to rebuild a parsed route or construct one from registered provider, account and native model components. Rejects separators in account names and preserves all native model separators and account spaces.
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
    if (/[/:]/.test(opts.accountName) || /[/:]/.test(opts.provider)) throw ctx.fns.models.inference.failure({message:'Invalid route components; choose a model.',status:400,info:{code:'INVALID_ROUTE',classification:'invalid_input',acceptance:'none',retryable:false,replaySafe:true}});
    const route = `${opts.provider}/${opts.accountName}:${opts.modelId}`;
    ctx.fns.models.inference.parseRoute({route});
    return route;
}
