/**
 * Reports whether an agent was created by `agent.delegate`, i.e. carries delegation metadata with a parent.
 *
 * Used as the `availableWhen` gate of the native `finish_task` tool, for advertisement and execution alike.
 * Legacy `agent.delegateTask` children are excluded: their completion contract differs.
 * @param opts.agent Agent to inspect.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Agent to inspect. */
        agent: types.agent.Agent;
    },
): boolean {
    const meta = opts.agent?.scratchpad?.delegation;
    return !!opts.agent?.parentId && !!meta && typeof meta === "object" && String(meta.parentId ?? "") === String(opts.agent.parentId);
}
