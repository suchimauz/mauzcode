/**
 * Turn a provider error or message into a short text without secret values
 *
 * Use before returning any provider-originated message to clients. Removes the connection's own secret values when given, secret:// references, bearer tokens and common API-key shapes, collapses whitespace and truncates to 300 characters.
 * @param opts.message Error, string or unknown thrown value.
 * @param opts.secrets Plain secret values of the connection that must never appear.
 * @param opts.fallback Text used when nothing safe remains. @default "Request failed"
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Error, string or unknown thrown value. */
        message: unknown;
        /** Plain secret values of the connection that must never appear. */
        secrets?: string[];
        /** Text used when nothing safe remains. @default "Request failed" */
        fallback?: string;
    },
): string {
    return ctx.fns.models.connections.safeMessage(opts);
}
