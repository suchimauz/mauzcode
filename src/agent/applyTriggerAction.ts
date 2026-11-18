/**
 * Run/check now or cancel one trigger of the calling agent, replay-safely
 *
 * Agent capability behind a person's `/trigger …` message (an ordinary request, not code). Bare `/trigger`: ask whether to add a one-shot wake, recurring cron or condition watch. Creation: use agent.wake/cron/watch with the timing and purpose already given, ask only what is missing, and report creation only after it returned an id. Run/check-now and cancel go through this function. Acts only on the calling agent's own trigger, through the same operation and outcomes as the chat panel: `scheduled`, `deferred_paused` (runs after the agent resumes), `already_checking`, `not_active`, `cancelled`, or `planning` (blocked in PLAN mode; nothing changed). `scheduled` means made due, not fired. The idempotency key is derived from the latest accepted /trigger command plus action and target, so a retry after clarification never repeats the change. Resolve exactly one target with agent.triggers first (ask if several match, change nothing if none; never substitute another trigger). A cancellation reply names the trigger's id, kind and purpose. In PLAN mode only clarify.
 * @param opts.triggerId Exact trigger of the calling agent.
 * @param opts.action Run/check now, or cancel.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact trigger of the calling agent. */
        triggerId: string;
        /** Run/check now, or cancel. */
        action: 'run' | 'cancel';
    },
): Promise<types.agent.TriggerActionResult> {
    const agentId = (await ctx.fns.agent.current({})).id;
    const [command] = await ctx.fns.procs.db.select({ sql: "SELECT client_request_id FROM messages WHERE agent_id=? AND role='user' AND client_request_id IS NOT NULL AND content LIKE '/trigger%' ORDER BY idx DESC LIMIT 1", params: [agentId] });
    const triggerId = String(opts.triggerId ?? '').trim();
    const requestId = command?.client_request_id
        ? `cmd:${String(command.client_request_id).slice(0, 120)}:${opts.action}:${triggerId.slice(0, 60)}`
        : `agent:${Bun.randomUUIDv7()}`;
    return ctx.fns.agent.triggerAction({ agentId, triggerId, action: opts.action, requestId });
}
