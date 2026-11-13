/**
 * Test a model connection through its provider and cache the safe result
 *
 * Use for an explicit "Test" button or before relying on a connection. Disabled connections return status `disabled` without calling the provider or the network. Otherwise calls the provider `test` with the connection bound to its transport; a throw or a malformed result becomes `unavailable` with a machine-readable reason and a message cleaned of secret values. Results are cached for 60 s per connection revision (any update invalidates) and concurrent calls share one in-flight check.
 * @param opts.id Connection UUID.
 * @param opts.cached Reuse a result from the last 60 s instead of testing again. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Reuse a result from the last 60 s instead of testing again. @default false */
        cached?: boolean;
    },
): Promise<types.models.TestResult> {
    return ctx.fns.models.connections.test(opts);
}
