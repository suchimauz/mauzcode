/** Build provider-neutral tool declarations, respecting the agent's selection and prose-only goal receipts.
 * Providers own wire dialect conversion; callers must not select an API dialect.
 * @param opts.agent Agent whose tool selection is used.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Live agent instance to operate on. */
    agent: types.agent.Agent },
): types.models.ToolSpec[] {
    // Run-owned completion receipts are prose-only, irrespective of agent tool settings.
    if ((ctx as Context & { goalCompletionReport?: boolean }).goalCompletionReport) return [];
    const only = opts.agent.tools;
    return ctx.fns.tools.list({})
        .filter(tool => !only?.length || only.includes(tool.wireName) || only.includes(tool.name))
        .map(tool => ({ name: tool.wireName, description: tool.description, parameters: tool.parameters }));
}
