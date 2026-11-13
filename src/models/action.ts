/**
 * Invoke a provider-declared action such as login or logout on one connection
 *
 * Use for provider-owned flows; the core implements no provider-specific authorization. Fails with `UNKNOWN_ACTION` (nothing called) when the provider did not declare the action. Disabled connections are refused. The result must be JSON-compatible; any of the connection's secret values or secret:// references found in it cause the result to be withheld.
 * @param opts.id Connection UUID.
 * @param opts.action Declared action name.
 * @param opts.input JSON-compatible action input. @default null
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Declared action name. */
        action: string;
        /** JSON-compatible action input. @default null */
        input?: types.models.ActionValue;
    },
): Promise<types.models.ActionValue> {
    return ctx.fns.models.connections.action(opts);
}
