/**
 * Reject provider options a provider does not support before any network request
 *
 * Helper for ProviderDefinition.stream implementations: throws INVALID_INPUT (not retryable, replay-safe) naming the provider when providerOptions contains any key outside `allowed`. Keys are never echoed. Call first in a provider's stream.
 * @param opts.provider Provider id used in the message.
 * @param opts.providerOptions Options from StreamRequest.providerOptions.
 * @param opts.allowed Supported option keys. @default []
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider id used in the message. */
        provider: string;
        /** Options from StreamRequest.providerOptions. */
        providerOptions?: Record<string, unknown>;
        /** Supported option keys. @default [] */
        allowed?: string[];
    },
): void {
    const allowed = new Set(opts.allowed ?? []);
    const unknown = Object.keys(opts.providerOptions ?? {}).filter(key => !allowed.has(key));
    if (unknown.length) throw ctx.fns.models.inference.failure({ message: `Provider ${opts.provider} does not support ${unknown.length === 1 ? "this provider option" : "these provider options"}`, status: 400, info: { code: "INVALID_INPUT", classification: "invalid_input", acceptance: "none", retryable: false, replaySafe: true } });
}
