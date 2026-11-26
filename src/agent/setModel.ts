// Changing the model of a LIVE agent — previously impossible: the model was
// fixed at creation, so an exhausted subscription left the only choice of
// waiting. This is the manual half of the parking story: switch model, or
// switch to another credential of the same provider, and continue now.
/** Switches an inactive agent to another model or credential account. */
/**
 * Point an existing agent at a different model, provider or credential account.
 *
 * Rejects active worker/direct runs before changing any target; idle agents,
 * including usage-limit parked agents, can still switch through the UI.
 * Validates the target through models.resolveRoute before persistence, records a visible
 * transcript event, and lifts a usage-limit parking so the interrupted work
 * resumes immediately on the new model.
 *
 * The route change is the unit of persistence: model and requested reasoning
 * effort are written together in one guarded update per agent (including every
 * provider-scope target) and mirrored on the live agent before unpark or the
 * next inference. A different provider or provider-native model slug resets the
 * requested effort to `auto`; the same slug on another connection of the same
 * provider keeps the effort when the target's cached catalogue lists it as
 * supported (models.listModels cacheOnly, never discovery) and otherwise resets
 * to `auto`, including a cold catalogue or one without reasoning levels. A
 * same-route selection changes nothing. A failed unpark rolls back the previous
 * pair only while the committed pair is still current, so a later edit wins.
 * Clients must not send a second effort mutation after a switch.
 *
 * @param opts.id Agent whose model changes.
 * @param opts.model Target model as "<provider>/<accountName>:<modelId>".
 * @param opts.scope Apply to this agent only, or to every agent sharing its parked credential.
 * @param opts.now Current time in ms, for testing.
 * @param opts.expectedModel Optional exact previously observed route; rejects stale per-agent parameter edits.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Agent identifier. */
        id: string;
        /** Canonical provider/accountName:modelId route; account names may contain spaces. */
        model: string;
        /** "agent" changes one agent; "provider" changes every agent parked on the same credential. @default "agent" */
        scope?: "agent" | "provider";
        /** Current timestamp in ms; defaults to Date.now(). */
        now?: number;
        /** Require the agent route to equal this observed value before applying an agent-scoped edit. */
        expectedModel?: string;
    },
): Promise<{ changed: string[]; model: string; from: string | null }> {
    const raw = String(opts.model ?? "").trim();
    const resolved = await ctx.fns.models.resolveRoute({ route: raw });
    const model = resolved.route;
    const now = opts.now ?? Date.now();
    if (!model) throw new Error("setModel: model is required");
    if (opts.expectedModel !== undefined && opts.scope === "provider") throw new Error("setModel: expectedModel requires agent scope");


    const row = ((await ctx.fns.procs.db.select({
        sql: "SELECT id, model, scratchpad FROM agents WHERE id = ? AND archived_at IS NULL",
        params: [opts.id],
    })) as any[])[0];
    if (!row) throw new Error(`setModel: agent not found: ${opts.id}`);
    const from = row.model ? String(row.model) : null;
    if (opts.expectedModel !== undefined && from !== opts.expectedModel) throw new Error("setModel: model changed; reopen settings and retry");

    let targets = [String(row.id)];
    if (opts.scope === "provider") {
        // "Move everyone off the credential that ran out" — the common case when
        // a whole group of agents was parked by one exhausted plan.
        let parked: any = null;
        try { parked = JSON.parse(String(row.scratchpad ?? "{}"))?.parked ?? null; } catch { parked = null; }
        if (parked?.provider) {
            const rows = (await ctx.fns.procs.db.select({
                sql: "SELECT id, model FROM agents WHERE archived_at IS NULL AND model IS NOT NULL",
                params: [],
            })) as any[];
            targets = [];
            for (const r of rows) {
                if (String(r.model ?? '').startsWith(`${parked.provider}/${parked.account}:`)) targets.push(String(r.id));
            }
            if (!targets.includes(String(row.id))) targets.push(String(row.id));
        }
    }

    // Preflight the whole group before the first mutation. A stale controller
    // is not evidence of a live run; activeRunCount tracks direct-run lifetime.
    // provider/accountName:modelSlug split without trimming; a malformed stored route counts as another model.
    const split = (route: string | null) => {
        const slash = route ? route.indexOf("/") : -1, colon = route ? route.indexOf(":", slash + 1) : -1;
        return route && slash > 0 && colon > slash ? { provider: route.slice(0, slash), account: route.slice(slash + 1, colon), slug: route.slice(colon + 1) } : null;
    };
    const target = split(model);
    // Supported levels of the target, read once and cache-only; undefined means unknown.
    let targetLevels: string[] | null | undefined;
    const levels = async (): Promise<string[] | null> => {
        if (targetLevels !== undefined) return targetLevels;
        try {
            const id = resolved.connectionId;
            const entry = id ? (await ctx.fns.models.listModels({ id, cacheOnly: true })).models.find(m => m.id === (resolved.model ?? target?.slug)) : undefined;
            targetLevels = entry?.reasoning?.supported?.length ? [...entry.reasoning.supported] : null;
        } catch { targetLevels = null; }
        return targetLevels;
    };
    /** Requested effort that travels with the new route. */
    const nextEffort = async (previous: string | null, effort: string): Promise<string> => {
        if (effort === "auto") return "auto";
        const from = split(previous);
        if (!from || !target || from.provider !== target.provider || from.slug !== target.slug) return "auto";
        // Account-only switch: keep a level the target catalogue lists, otherwise Default.
        return (await levels())?.includes(effort) ? effort : "auto";
    };
    const prepared: { id: string; previous: string | null; effort: string; next: string }[] = [];
    for (const id of targets) {
        const before = ((await ctx.fns.procs.db.select({ sql: "SELECT model, run_state, reasoning_effort FROM agents WHERE id = ? AND archived_at IS NULL", params: [id] })) as any[])[0];
        if (!before) throw new Error(`setModel: agent not found: ${id}`);
        const previous = before.model ? String(before.model) : null;
        if (opts.expectedModel !== undefined && previous !== opts.expectedModel) throw new Error("setModel: model changed; reopen settings and retry");
        const live = (ctx.state as any).agent?.[id];
        if (previous === model && (!live || live.model === model)) continue;
        if (before.run_state === "running" || Number(live?.activeRunCount ?? 0) > 0) {
            throw new Error(`setModel: agent ${id} is running; wait for the run to finish`);
        }
        const effort = String(before.reasoning_effort || "auto");
        prepared.push({ id, previous, effort, next: previous === model ? effort : await nextEffort(previous, effort) });
    }
    const changed: string[] = [];
    for (const { id, previous, effort, next } of prepared) {
        const live = (ctx.state as any).agent?.[id];
        // The live object is what the next turn reads. A row edited behind the
        // process (SQL, migration) can already say the new model while the agent
        // in memory still runs the old one — that drift is exactly a switch.
        if (previous === model && (!live || live.model === model)) continue;
        // The last error belonged to the old model; leaving it makes the status
        // bar keep shouting about a credential the agent no longer uses.
        // Recheck after async preflight, then CAS against a worker claim or
        // another model switch. Direct runs still lack a durable DB lease.
        if (Number(live?.activeRunCount ?? 0) > 0) throw new Error(`setModel: agent ${id} is running; wait for the run to finish`);
        // Route and effort are one pair: the guard also covers the effort, so a concurrent manual edit is never overwritten.
        const updated = await ctx.fns.procs.db.run({
            sql: "UPDATE agents SET model = ?, reasoning_effort = ?, last_error = NULL, updated_at = ? WHERE id = ? AND archived_at IS NULL AND run_state = 'idle' AND model IS NOT DISTINCT FROM ? AND COALESCE(NULLIF(reasoning_effort, ''), 'auto') = ?",
            params: [model, next, now, id, previous, effort],
        });
        if (!updated.changes) throw new Error(`setModel: agent ${id} is running or changed; retry after it is idle`);
        const liveBefore = live?.model ?? previous;
        const liveEffort = live ? live.reasoningEffort : undefined;
        // The live pair is what unpark and the next turn read.
        if (live) { live.model = model; live.reasoningEffort = next; }
        await ctx.fns.session.appendEvent({ id, event: { type: "model_changed", from: liveBefore, to: model } }).catch(() => undefined);
        if (next !== effort) await ctx.fns.session.appendEvent({ id, event: { type: "reasoning_effort_changed", from: effort, to: next, applied: next, reason: "model-changed" } }).catch(() => undefined);
        // A new model means a new quota. If lifting the parking fails, roll the
        // model back and fail the operation — returning success with a new
        // model but an old wake/park mark strands the unanswered work.
        try {
            await ctx.fns.agent.unpark({ id, reason: "model-switch", now });
        } catch (error) {
            // Restore the replaced pair only while this switch's pair is still current: a later edit wins.
            const restored = await ctx.fns.procs.db.run({
                sql: "UPDATE agents SET model = ?, reasoning_effort = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL AND model IS NOT DISTINCT FROM ? AND COALESCE(NULLIF(reasoning_effort, ''), 'auto') = ?",
                params: [previous, effort, Date.now(), id, model, next],
            }).catch(() => ({ changes: 0 }));
            if (live && restored.changes && live.model === model && live.reasoningEffort === next) { live.model = previous; live.reasoningEffort = liveEffort ?? effort; }
            throw error;
        }
        ctx.fns.events.refreshAgentMeta({ agentId: id, section: "wake", reason: "model-changed" });
        changed.push(id);
        // A checkpoint the new model cannot read falls back to the full
        // transcript (compaction.portable); re-compact for the new window now
        // rather than overflowing on the next turn. Background, best effort.
        const switched = live ?? await ctx.fns.session.load({ id }).catch(() => null);
        if (switched) void ctx.fns.agent.autoCompactIfNeeded({ agent: switched }).catch(() => undefined);
    }
    if (changed.length) { try { ctx.fns.events.emitAgentsChanged({}); } catch {} }

    return { changed, model, from };
}
