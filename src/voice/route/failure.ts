/**
 * Build a credential-safe voice route error
 *
 * Internal single source for route failures: a short user-facing message plus one `code` from the routing set
 * (`unconfigured` when no route is selected at all, `routeUnavailable` when a selected route cannot be used) and
 * a closed local `reason` identifying which routing check failed. The message never contains a secret value, a
 * `secret://` reference or provider payload; a route string may appear because a route is a user-visible label,
 * not a credential. Reasons: `invalid-route` grammar, `unknown-provider` registration, `unknown-connection`
 * account, `unknown-model` catalogue, `catalogue-failed` discovery, `not-selected` nothing was configured.
 * Failures carry no retry semantics: resolving a route sends no request.
 * @param opts.code Session routing code; `routeUnavailable` by default. @default routeUnavailable
 * @param opts.message User-facing sentence without vendor payloads.
 * @param opts.reason Closed local reason identifying which routing check failed.
 * @param opts.status HTTP status the caller should answer with. @default 409
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Session routing code; `routeUnavailable` by default. @default routeUnavailable */
        code?: "unconfigured" | "routeUnavailable";
        /** User-facing sentence without vendor payloads. */
        message: string;
        /** Closed local reason identifying which routing check failed. */
        reason: "not-selected" | "invalid-route" | "unknown-provider" | "unknown-connection" | "unknown-model" | "catalogue-failed";
        /** HTTP status the caller should answer with. @default 409 */
        status?: number;
    },
): Error & { code: "unconfigured" | "routeUnavailable"; reason: string; status: number; retryable: false } {
    // The literal is typed so `retryable: false` survives: a route failure carries no retry semantics.
    return Object.assign(new Error(opts.message), {
        code: (opts.code ?? "routeUnavailable") as "unconfigured" | "routeUnavailable",
        reason: opts.reason,
        status: opts.status ?? 409,
        retryable: false as const,
    });
}
