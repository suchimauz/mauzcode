/**
 * Validate a provider transport and its saved reference
 *
 * Use before saving a model connection. Reject unsupported kinds, missing saved proxies and SSH instances without a pinned host key; never open a network connection or decrypt credentials.
 * @param opts.transport Transport selection with its saved proxy or SSH reference.
 * @param opts.allowed Allowed transports declared by the selected provider.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Transport selection with its saved proxy or SSH reference. */
        transport: types.models.TransportSpec;
        /** Allowed transports declared by the selected provider. */
        allowed: types.models.TransportSpec["kind"][];
    },
): Promise<void> {
    return ctx.fns.models.transport.validateTransport(opts);
}
