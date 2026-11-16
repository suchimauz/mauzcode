/**
 * Builds the trusted discovery predicate for one frozen preset snapshot.
 *
 * The single source of the `allows` filter passed to discovery functions by the eval boundary
 * (`guardFns`), the system prompt and native tool adapters, so the routes cannot diverge.
 * Returns undefined without a snapshot, which preserves unscoped internal discovery.
 * Never accept this predicate from model arguments.
 * @param opts.snapshot Immutable creation-time rules of the invoking agent; omit for unscoped callers.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Immutable creation-time rules of the invoking agent; omit for unscoped callers. */
        snapshot?: types.agentPreset.Snapshot;
    },
): ((name: string) => boolean) | undefined {
    const snapshot = opts.snapshot;
    if (!snapshot) return undefined;
    return (name: string) => ctx.fns.agentPreset.allows({ snapshot, name });
}
