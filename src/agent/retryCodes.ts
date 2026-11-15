// The one vocabulary of model failure codes that may be retried.
//
// Two lists, and the difference between them matters:
//
//   allowed — a code a policy MAY retry. Being here is permission, not a
//             decision: the failure's own `retryable` flag still has the last
//             word, and `agent.retryPolicy.retryableCodes` can only narrow.
//   never   — a code no policy can ever retry. Waiting cannot fix an expired
//             token, a malformed request, a disabled model or an exhausted
//             subscription, and a retried OVERFLOW only burns tokens.
//
// The setting descriptor validates against `allowed` and `agent.retryDecision`
// decides with both, so the lists live here once instead of being copied.
/**
 * Lists the model failure codes a retry policy may use and the codes no policy can retry.
 *
 * Use to build or validate an `agent.retryPolicy`, or to explain why a failure was not
 * retried. `allowed` is permission only: the failure's own `retryable` flag and the
 * configured `retryableCodes` must also agree. `never` holds codes that no configuration
 * can make retryable.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    _opts?: {},
): { allowed: string[]; never: string[] } {
    return {
        allowed: [
            // Throttling and transient upstream health.
            'RATE_LIMIT', 'RATE_LIMITED', 'THROTTLED', 'SERVER', 'PROVIDER_UNAVAILABLE', 'PROVIDER_ERROR', 'TIMEOUT',
            // Interrupted generation: network, proxy, stream and empty replies.
            'TRANSPORT', 'STREAM_INTERRUPTED', 'EMPTY_RESPONSE', 'SSH_TRANSPORT',
            'PROXY_DNS', 'PROXY_CONNECT', 'PROXY_TIMEOUT', 'PROXY_CONNECTION_LOST', 'PROXY_PROTOCOL',
        ],
        never: [
            // Waiting cannot change these; the turn must stop with the error.
            'QUOTA_EXHAUSTED', 'AUTH', 'INVALID_INPUT', 'OVERFLOW', 'CANCELLED',
            'MODEL_DISABLED_BY_USER', 'CONNECTION_DISABLED', 'MODEL_NOT_SELECTED',
            'PROXY_AUTH', 'PROXY_CONFIG', 'PROXY_TLS', 'PROXY_DENIED', 'SSH_PERMANENT',
        ],
    };
}
