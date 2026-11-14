// Parking: what to do when a subscription window is spent.
//
// The quota belongs to a credential, not to an agent — when one agent hits it,
// every other agent on the same provider+account is already out of quota too.
// Discovering that one failure at a time costs a wasted request and a red toast
// per agent, so the first failure parks the whole group at once.
//
// Parked is deliberately NOT an error state: nothing is broken, and there is
// nothing for the user to fix. The agent keeps its unread messages (the run
// cursor never advanced), gets a wake-up at the reset moment, and continues on
// its own. agent.deliverWakes then clears the mark.
/** Parks every agent sharing an exhausted subscription until its quota resets. */
/**
 * Park all agents that share an exhausted subscription credential.
 *
 * Marks each agent as parked, schedules a durable wake-up at the reset moment
 * with per-agent jitter, clears the pending run and emits one toast for the
 * whole group. Call from the worker after a QUOTA_EXHAUSTED models failure.
 * Missing/past reset times use a finite default bounded to one minute–one day.
 * @param opts.info Provider-neutral quota failure.
 * @param opts.originAgentId Agent whose route identifies the exhausted connection, for the toast.
 * @param opts.fallbackMs Parking duration when the provider gives no reset time.
 * @param opts.now Current time in ms, for testing.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Classified failure with code QUOTA_EXHAUSTED. */
        info: types.models.FailureInfo;
        /** Agent whose model identifies the exhausted connection. */
        originAgentId: string;
        /** Parking duration when resetAt is unknown, ms. @default 3600000 @minimum 60000 @maximum 86400000 */
        fallbackMs?: number;
        /** Current timestamp in ms; defaults to Date.now(). */
        now?: number;
    },
): Promise<{ provider: string; account: string; resetsAt: number; parked: string[] }> {
    if (opts.info.code !== 'QUOTA_EXHAUSTED') throw new Error('parkOnUsageLimit: expected QUOTA_EXHAUSTED');
    const origin = (await ctx.fns.procs.db.select({ sql: 'SELECT model FROM agents WHERE id = ?', params: [opts.originAgentId] }))[0];
    if (!origin) throw new Error('Quota origin agent not found');
    const route = await ctx.fns.models.resolveRoute({ route: String(origin.model) });
    const info = { provider: route.provider, account: route.accountName, message: 'Model connection quota exhausted', planType: null };
    const now = opts.now ?? Date.now();
    const fallbackMs = Number.isFinite(opts.fallbackMs) ? Math.max(60_000, Math.min(86_400_000, opts.fallbackMs!)) : 3_600_000;
    const resetsAt = Number.isFinite(opts.info.resetAt) && opts.info.resetAt! > now ? opts.info.resetAt! : now + fallbackMs;

    const rows = (await ctx.fns.procs.db.select({
        sql: "SELECT id, model, wake_at, wake_reason FROM agents WHERE archived_at IS NULL AND model IS NOT NULL",
        params: [],
    })) as any[];

    const targets = [];
    for (const row of rows) {
        // Compare only the exact route prefix; model ids may contain any separators.
        if (String(row.model).startsWith(`${route.provider}/${route.accountName}:`)) targets.push(row);
    }

    const reason = `${info.provider} usage limit resets — continue the interrupted work`;
    const parked: string[] = [];

    for (const row of targets) {
        const id = String(row.id);
        // Jitter: without it every agent of the group wakes in the same second
        // and hits the API simultaneously. A minute of slack also absorbs clock
        // skew and an imprecise resets_at.
        const at = resetsAt + 60_000 + (hash(id) % 240_000);
        try {
            const updated = await ctx.fns.session.mutateScratchpad({
                id,
                mutate: (scratchpad: Record<string, any>) => {
                    const already = scratchpad.parked ?? null;
                    scratchpad.parked = {
                        reason: "usage_limit",
                        provider: info.provider,
                        account: info.account,
                        model: String(row.model ?? ""),
                        planType: info.planType ?? null,
                        resetsAt,
                        wakeAt: at,
                        parkedAt: now,
                        message: info.message,
                        // Only one time alarm exists per agent; remember what we
                        // overwrote so unpark can put a user's own wake back.
                        // A repeat 429 after a premature wake must preserve the
                        // ORIGINAL user alarm, not remember our own parking wake
                        // as if it belonged to the user.
                        previousWake: already?.previousWake ?? (row.wake_at ? { at: Number(row.wake_at), reason: String(row.wake_reason ?? "") } : null),
                    };
                },
            });
            // Parking replaces the pending run and clears the error: this is a
            // wait, not a failure, and "send a message to retry" is bad advice.
            await ctx.fns.procs.db.run({
                sql: "UPDATE agents SET wake_at = ?, wake_reason = ?, next_run_at = NULL, last_error = NULL, updated_at = ? WHERE id = ? AND archived_at IS NULL",
                params: [at, reason, now, id],
            });
            const live = (ctx.state as any).agent?.[id];
            if (live) {
                live.scratchpad = updated.scratchpad;
                live.wakeAt = at;
                live.wakeReason = reason;
            }
            await ctx.fns.session.appendEvent({
                id,
                event: {
                    type: "parked",
                    reason: "usage_limit",
                    provider: info.provider,
                    account: info.account,
                    planType: info.planType ?? null,
                    resetsAt,
                    wakeAt: at,
                    message: info.message,
                },
            });
            ctx.fns.events.refreshAgentMeta({ agentId: id, section: "wake", reason: "parked" });
            parked.push(id);
        } catch (error: any) {
            console.error(`parkOnUsageLimit: could not park ${id}:`, error?.message ?? error);
        }
    }

    // ONE toast for the group. Fourteen identical toasts is how the current
    // behaviour turns a single exhausted plan into noise.
    if (parked.length) {
        await ctx.fns.ui.notify({
            agentId: opts.originAgentId,
            level: "warn",
            message: `${info.provider}${info.account === "default" ? "" : `/${info.account}`}: limit reached — ${parked.length} agent(s) parked`,
            body: `${info.message}\nAgents will resume automatically: ${parked.join(", ")}`,
        }).catch(() => {});
    }


    return { provider: info.provider, account: info.account, resetsAt, parked };
}



function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
}
