/**
 * Bind the executing agent tool call to nested runtime calls
 *
 * Internal run integration. tools.call enters a scope with the provider tool-call id of the agent's current call; nested calls (including those made inside a code-evaluation tool) read the enclosing call. Used to record who created a trigger. Never derived from model arguments and never an authorization source.
 * @param opts.action Enter a scope for a callback or read the current binding.
 * @param opts.binding Calling agent and provider tool-call id; required for with.
 * @param opts.fn Callback executed inside the scope; required for with.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Enter a scope for a callback or read the current binding. */
        action: "with" | "read";
        /** Calling agent and provider tool-call id; required for with. */
        binding?: { agentId: string; toolCallId: string };
        /** Callback executed inside the scope; required for with. */
        fn?: () => Promise<unknown>;
    },
): Promise<unknown> {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    const holder = ctx.state as typeof ctx.state & { agentToolCallScope?: InstanceType<typeof AsyncLocalStorage> };
    const storage = holder.agentToolCallScope ??= new AsyncLocalStorage();
    if (opts.action === 'read') return storage.getStore();
    if (!opts.fn) throw new Error('Tool call scope requires callback');
    const b = opts.binding;
    if (!b?.agentId || !b.toolCallId) return opts.fn();
    return storage.run(Object.freeze({ agentId: String(b.agentId), toolCallId: String(b.toolCallId) }), opts.fn);
}
