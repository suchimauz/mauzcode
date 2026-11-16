/**
 * Native `request_input` adapter: opens a structured chat input owned by the invoking agent.
 *
 * The owner comes only from the trusted tool invocation; arguments cannot name an agent, session or
 * owner. The kind must be registered and visible to the agent's preset (unregistered and unavailable
 * kinds fail identically, listing nothing), and its spec is validated by the kind before anything is
 * created. Returns at once with the request id and never the answer. With waitForAnswer the run loop
 * ends the turn after this call; the answer arrives later as a new `<input-result>` turn. Answers,
 * including a generic confirm, never satisfy protected approvals, and secret kinds return only a reference.
 * @param opts.kind Registered input kind available to this agent, for example confirm, choice, grid, batch or secret.
 * @param opts.title Short question shown as the card heading.
 * @param opts.message Optional Markdown explanation under the heading.
 * @param opts.spec Kind-specific settings validated by the kind.
 * @param opts.waitForAnswer End this turn and wait for the answer when true. @default false
 * @param opts.expiresAt Optional future epoch-millisecond deadline.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Registered input kind available to this agent, for example confirm, choice, grid, batch or secret. */
        kind: string;
        /** Short question shown as the card heading. */
        title: string;
        /** Optional Markdown explanation under the heading. */
        message?: string;
        /** Kind-specific settings validated by the kind. */
        spec?: Record<string, any>;
        /** End this turn and wait for the answer when true. @default false */
        waitForAnswer?: boolean;
        /** Optional future epoch-millisecond deadline. */
        expiresAt?: number;
    },
): Promise<{ id: string; kind: string; state: "open"; waiting: boolean }> {
    const unknown = Object.keys(opts ?? {}).filter(key => !["kind", "title", "message", "spec", "waitForAnswer", "expiresAt"].includes(key));
    if (unknown.length) throw new Error(`request_input: unknown argument ${unknown.join(", ")}`);
    const agent = session?.agent;
    if (!agent?.id) throw new Error("request_input: requires a trusted agent invocation");
    if (opts.spec !== undefined && (!opts.spec || typeof opts.spec !== "object" || Array.isArray(opts.spec))) throw new Error("request_input: spec must be an object");
    if (opts.waitForAnswer !== undefined && typeof opts.waitForAnswer !== "boolean") throw new Error("request_input: waitForAnswer must be a boolean");
    const kindName = typeof opts.kind === "string" ? opts.kind.trim().toLowerCase() : "";
    const allows = ctx.fns.agentPreset.predicate({ snapshot: agent.preset });
    // One message for unregistered and preset-hidden kinds; it never lists kinds.
    if (!kindName || !ctx.fns.input.kinds({ allows }).some(kind => kind.name === kindName)) throw new Error(`request_input: kind "${kindName}" is not available`);
    const created = await ctx.fns.input.request({
        kind: kindName,
        title: opts.title,
        message: opts.message,
        spec: opts.spec,
        waitForAnswer: opts.waitForAnswer === true,
        expiresAt: opts.expiresAt,
        agentId: agent.id,
    });
    return { id: created.id, kind: created.kind, state: created.state, waiting: opts.waitForAnswer === true };
}
