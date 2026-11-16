/**
 * Decides whether a declared tool may be advertised to and executed by an agent with this preset.
 *
 * A tool is permitted when the preset allows its implementing function and every function named in
 * its `requires` list (the capabilities a native adapter wraps). Without a snapshot every tool is
 * permitted, which preserves legacy and internal callers. Used by `agent.wireTools`, `tools.call`
 * and preset-scoped `tools.list`, so advertisement and execution cannot diverge.
 * @param opts.tool Registered tool declaration as returned by `tools.list`.
 * @param opts.snapshot Immutable preset of the invoking agent; omit for unscoped callers.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Registered tool declaration as returned by `tools.list`. */
        tool: { module: string; name: string; fn?: string; requires?: unknown };
        /** Immutable preset of the invoking agent; omit for unscoped callers. */
        snapshot?: types.agentPreset.Snapshot;
    },
): boolean {
    const allows = ctx.fns.agentPreset.predicate({ snapshot: opts.snapshot });
    if (!allows) return true;
    const names = ctx.fns.tools.requirements({ tool: opts.tool });
    return !!names && names.every(name => allows(name));
}
