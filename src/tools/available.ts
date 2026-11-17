/**
 * Decides whether a declared tool applies to this agent's situation, independent of its preset.
 *
 * A tool with `availableWhen: "module.function"` is advertised and executable only when that predicate,
 * called with `{ agent }`, returns true. Without an agent, a missing predicate or a throwing predicate the
 * tool is unavailable (fail closed). Tools without `availableWhen` are always available. Used by
 * `agent.wireTools` and `tools.call`, so advertisement and execution cannot diverge.
 * @param opts.tool Registered tool declaration as returned by `tools.list`.
 * @param opts.agent Invoking agent; omitted means no agent-bound situational tool is available.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Registered tool declaration as returned by `tools.list`. */
        tool: { availableWhen?: unknown };
        /** Invoking agent; omitted means no agent-bound situational tool is available. */
        agent?: types.agent.Agent;
    },
): boolean {
    const gate = opts.tool.availableWhen;
    if (gate === undefined) return true;
    if (typeof gate !== "string" || !gate || !opts.agent) return false;
    const predicate = gate.split(".").reduce((node: any, seg: string) => node?.[seg], ctx.fns as any);
    if (typeof predicate !== "function") return false;
    try {
        return predicate({ agent: opts.agent }) === true;
    } catch {
        return false;
    }
}
