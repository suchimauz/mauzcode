/**
 * Native `finish_task` adapter: finishes the invoking delegated child's todos and delivers its result.
 *
 * Executable only for an agent created by `agent.delegate` (see `tools.isDelegatedChild`). Binds the child
 * only from the trusted tool invocation and delegates to `agent.finishTask`, which rejects unfinished todos,
 * stores the result on the final todo and enqueues the parent update exactly once.
 * @param opts.summary Concise parent-facing summary of the completed work.
 * @param opts.result Required result object; arrays, scalars, null and JSON-encoded strings are rejected.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Concise parent-facing summary of the completed work. */
        summary: string;
        /** Required result object; arrays, scalars, null and JSON-encoded strings are rejected. */
        result: Record<string, unknown>;
    },
): Promise<{ ok: true; alreadyFinished: boolean; parentId: string | null }> {
    const unknown = Object.keys(opts ?? {}).filter(key => !["summary", "result"].includes(key));
    if (unknown.length) throw new Error(`finish_task: unknown argument ${unknown.join(", ")}`);
    const agent = session?.agent;
    if (!agent?.id) throw new Error("finish_task: requires a trusted agent invocation");
    if (!ctx.fns.tools.isDelegatedChild({ agent })) throw new Error("finish_task: only a delegated child agent can finish a task");
    if (typeof opts.summary !== "string" || !opts.summary.trim()) throw new Error("finish_task: summary must be a non-empty string");
    if (opts.result === undefined || opts.result === null) throw new Error("finish_task: result is required");
    // A typed object keeps models from sending a JSON-encoded string the parent cannot read as data.
    if (typeof opts.result !== "object" || Array.isArray(opts.result)) throw new Error("finish_task: result must be a JSON object; wrap a scalar as { value }");
    let json: string | undefined;
    try { json = JSON.stringify(opts.result); } catch { json = undefined; }
    if (json === undefined) throw new Error("finish_task: result must be JSON-compatible");
    const wasReady = agent.scratchpad?.delegation?.status === "ready";
    const out = await ctx.fns.agent.finishTask({ agent, summary: opts.summary, result: opts.result });
    return { ok: true, alreadyFinished: wasReady, parentId: out.parentId };
}
