/**
 * Parse a registered provider account model route without provider requests
 *
 * Use to split a route at the first slash and following colon, preserving spaces and native model separators. Malformed routes fail INVALID_ROUTE; recognized legacy shapes or unregistered providers fail LEGACY_ROUTE with owner selection guidance.
 * @param opts.route Exact provider/accountName:modelId route to parse without trimming.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact provider/accountName:modelId route to parse without trimming. */
        route: string;
    },
): types.models.ModelRoute {
    const route = opts.route;
    const fail = (code: string): never => { throw ctx.fns.models.inference.failure({message: code === 'LEGACY_ROUTE' ? `Legacy model route ${String(route)}; choose a model.` : `Invalid model route ${String(route)}; choose a model.`,status:400,info:{code,classification:'invalid_input',acceptance:'none',retryable:false,replaySafe:true}}); };
    if (typeof route !== 'string' || !route) fail('INVALID_ROUTE');
    if (route.startsWith('ssh/') || /^[^/:]+:.+$/.test(route)) fail('LEGACY_ROUTE');
    const slash=route.indexOf('/'), colon=route.indexOf(':',slash+1);
    if (slash <= 0 || colon <= slash+1 || colon === route.length-1 || route.slice(0,slash).includes(':')) fail('INVALID_ROUTE');
    const provider=route.slice(0,slash), accountName=route.slice(slash+1,colon), modelId=route.slice(colon+1);
    if (accountName.includes('/') || !accountName.trim() || !modelId.trim()) fail('INVALID_ROUTE');
    if (!Object.hasOwn(ctx.state.models?.providers ?? {},provider)) fail('LEGACY_ROUTE');
    return {provider,accountName,modelId};
}
