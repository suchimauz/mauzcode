type Arm = "eval" | "native";
type Outcome = "success" | "failure" | "not_exercised" | "error";
type Call = { agentId: string; name: string; args: any };
type Evidence = {
    dir: string;
    finalText: string;
    text: string;
    calls: Call[];
    byTool: Record<string, number>;
    totalCalls: number;
    rejected: number;
    storedResults: number;
    tokens: { prompt: number; completion: number; cacheRead: number };
    turns: number;
    childTurns: number;
    inputs: Array<{ id: string; agent_id: string; kind: string; state: string; title?: string; message?: string; spec: any }>;
    scratchpad: any;
    children: Array<{ id: string; scratchpad: any }>;
    agentIds: string[];
};
type Scenario = {
    id: string;
    capability: string;
    waitForChildren?: boolean;
    build: (c: Context, dir: string) => Promise<{ prompt: string; expected: any }>;
    exercised?: (e: Evidence) => boolean;
    check: (c: Context, e: Evidence, expected: any) => Promise<{ pass: boolean; detail: string }> | { pass: boolean; detail: string };
};
type ArmAggregate = {
    runs: number;
    exercised: number;
    notExercised: number;
    errors: number;
    success: number;
    successRate: number | null;
    toolCalls: number;
    rejected: number;
    totalTokens: number;
    exercisedTokens: number;
    p50Turns: number | null;
    p95Turns: number | null;
};
type RunRecord = {
    arm: Arm;
    scenario: string;
    repetition: number;
    agentId: string;
    agentIds: string[];
    outcome: Outcome;
    detail: string;
    toolCalls: number;
    toolsByName: Record<string, number>;
    rejected: number;
    storedResults: number;
    tokens: { prompt: number; completion: number; cacheRead: number };
    turns: number;
    childTurns: number;
    durationMs: number;
    openInputsCancelled: string[];
    openInputsLeft: number;
    finalText: string;
};
/**
 * Benchmark agent tool routes: eval-only versus native tools on fixed scenarios with objective checks
 *
 * Runs fixed scenarios (discovery, question, mixed, large_result, plan, delegate) in two arms built from one resolved preset snapshot: 'eval' denies the native adapters tools.toolSearch/toolDescribe/readResult/requestInput, 'native' is the unmodified clone. Every run uses a fresh hidden agent with its own scratch directory. Checks are objective (fixture-derived expected values, the inputs table, transcript tool calls, plan/delegation state). Runs whose scenario capability was not exercised (for example no stored result in large_result) are reported as not_exercised and excluded from success. Records per-run tool calls by name, rejected calls, tokens from context_usage events, model turns and duration; cancels any open input left by a run; aggregates success rate, rejected calls, tokens and p50/p95 turns per arm and scenario; evaluates the 10% decision threshold; and writes .mauzcode/bench/results/routes-<timestamp>.json. Costs real model tokens; use selfTest:true for a free check of arm construction, exercise detection and threshold logic.
 * @param opts.model Provider-qualified model used by every run in both arms; required unless selfTest is true.
 * @param opts.scenarios Scenario ids to run; omitted runs all six.
 * @param opts.arms Arms to run; omitted runs both. The decision is computed only when both run.
 * @param opts.repetitions Runs per scenario and arm. @default 3 @minimum 1 @maximum 10
 * @param opts.concurrency Runs executed in parallel. @default 4 @minimum 1 @maximum 8
 * @param opts.timeoutMs Per-run deadline after which the agent is stopped and the run reported as error. @default 600000 @minimum 30000 @maximum 1800000
 * @param opts.presetId Preset resolved as the common base of both arms; omitted uses the configured default (Standard).
 * @param opts.label Label stored in the report and used in scratch directory names. @default routes
 * @param opts.selfTest Only verify arm construction, not_exercised detection, rejection patterns and the threshold rule; makes no model calls. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-qualified model used by every run in both arms; required unless selfTest is true. */
        model?: string;
        /** Scenario ids to run; omitted runs all six. */
        scenarios?: string[];
        /** Arms to run; omitted runs both. The decision is computed only when both run. */
        arms?: Array<"eval" | "native">;
        /** Runs per scenario and arm. @default 3 @minimum 1 @maximum 10 */
        repetitions?: number;
        /** Runs executed in parallel. @default 4 @minimum 1 @maximum 8 */
        concurrency?: number;
        /** Per-run deadline after which the agent is stopped and the run reported as error. @default 600000 @minimum 30000 @maximum 1800000 */
        timeoutMs?: number;
        /** Preset resolved as the common base of both arms; omitted uses the configured default (Standard). */
        presetId?: string;
        /** Label stored in the report and used in scratch directory names. @default routes */
        label?: string;
        /** Only verify arm construction, not_exercised detection, rejection patterns and the threshold rule; makes no model calls. @default false */
        selfTest?: boolean;
    },
): Promise<any> {
    const NATIVE = ["tools.toolSearch", "tools.toolDescribe", "tools.readResult", "tools.requestInput", "tools.planUpdate", "tools.planDone", "tools.delegateTask", "tools.finishTask"];
    const REQUEST_WIRE = "request_input";
    const SYSTEM = "You are a participant in an automated benchmark. Work precisely, answer factually, and verify with tools when the task requires it.";
    const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? null; };
    const rand = (n: number) => { const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < n; i += 1) s += abc[Math.floor(Math.random() * abc.length)]; return s; };
    const isRejected = (content: string) => /^Error: invalid arguments|typecheck failed|unknown option/i.test(content);
    const calledRequest = (c: Call) => c.name === REQUEST_WIRE || (c.name === "tools_eval" && /input\.request\s*\(/.test(String(c.args?.code ?? "")));
    
    /** Builds both arms from one resolved snapshot; arm "eval" only adds the native adapter denies. */
    const buildArms = (base: types.agentPreset.Snapshot): Record<Arm, types.agentPreset.Snapshot> => {
        // The common base grants every native adapter, so a customized stored preset that predates an
        // adapter cannot silently turn the native arm into a second eval arm.
        const granted = structuredClone(base);
        const top = granted.layers[granted.layers.length - 1];
        if (top) top.allow = [...new Set([...top.allow, ...NATIVE])];
        const native = structuredClone(granted);
        const evalOnly = structuredClone(granted);
        const last = evalOnly.layers[evalOnly.layers.length - 1];
        if (!last) throw new Error("bench.routes: preset snapshot has no layers");
        last.deny = [...new Set([...last.deny, ...NATIVE])];
        return { eval: evalOnly, native };
    };
    const armsDiffOnlyByDenies = (a: types.agentPreset.Snapshot, b: types.agentPreset.Snapshot) => {
        const strip = (s: types.agentPreset.Snapshot) => JSON.stringify({ ...s, layers: s.layers.map((l) => ({ ...l, deny: l.deny.filter((d) => !NATIVE.includes(d)).sort() })) });
        const added = a.layers.flatMap((l) => l.deny).filter((d) => NATIVE.includes(d)).sort();
        const baseDenied = b.layers.flatMap((l) => l.deny).filter((d) => NATIVE.includes(d));
        return strip(a) === strip(b) && JSON.stringify(added) === JSON.stringify([...NATIVE].sort()) && baseDenied.length === 0;
    };
    const decide = (evalAgg: ArmAggregate, nativeAgg: ArmAggregate) => {
        const drop = (a: number | null, b: number | null) => (a && b !== null ? (a - b) / a : null);
        const tokensDrop = drop(evalAgg.exercisedTokens, nativeAgg.exercisedTokens);
        const p50Drop = drop(evalAgg.p50Turns, nativeAgg.p50Turns);
        const successOk = (nativeAgg.successRate ?? 0) >= (evalAgg.successRate ?? 0);
        const met = successOk && ((tokensDrop ?? -1) >= 0.1 || (p50Drop ?? -1) >= 0.1);
        return { met, successOk, tokensDrop, p50TurnsDrop: p50Drop, rule: "native success ≥ eval success AND (tokens or p50 turns fall ≥10%), exercised runs only" };
    };
    const aggregate = (runs: RunRecord[]): ArmAggregate => {
        const ex = runs.filter((r) => r.outcome !== "not_exercised" && r.outcome !== "error");
        const turns = ex.map((r) => r.turns);
        return {
            runs: runs.length,
            exercised: ex.length,
            notExercised: runs.filter((r) => r.outcome === "not_exercised").length,
            errors: runs.filter((r) => r.outcome === "error").length,
            success: ex.filter((r) => r.outcome === "success").length,
            successRate: ex.length ? ex.filter((r) => r.outcome === "success").length / ex.length : null,
            toolCalls: runs.reduce((a, r) => a + r.toolCalls, 0),
            rejected: runs.reduce((a, r) => a + r.rejected, 0),
            totalTokens: runs.reduce((a, r) => a + r.tokens.prompt + r.tokens.completion, 0),
            exercisedTokens: ex.reduce((a, r) => a + r.tokens.prompt + r.tokens.completion, 0),
            p50Turns: pct(turns, 0.5),
            p95Turns: pct(turns, 0.95),
        };
    };
    
    const SCENARIOS: Scenario[] = [
        {
            id: "discovery",
            capability: "discovery lookup",
            build: async (c) => {
                const doc: any = await c.fns.runtime.docs.get({ name: "markdown.highlight" });
                const required: string[] = doc?.paramsSchema?.required ?? [];
                if (!required.length) throw new Error("discovery: markdown.highlight has no required options");
                return { prompt: "Which MauzCode runtime function highlights a source-code string as HTML, and what are its required options? Look it up with tools, do not guess. Answer with the exact dotted function name and the required option names only.", expected: { name: "markdown.highlight", required } };
            },
            exercised: (e) => e.calls.length > 0,
            check: async (_c, e, x) => {
                const nameOk = e.text.includes(x.name);
                const missing = x.required.filter((o: string) => !new RegExp(`\\b${o}\\b`).test(e.text));
                return { pass: nameOk && !missing.length, detail: `name=${nameOk} missing=[${missing.join(",")}]` };
            },
        },
        {
            id: "question",
            capability: "structured input",
            build: async () => ({ prompt: "Ask me, with a proper choice form, which of these three branches to delete: feature/a, feature/b, feature/c. Do not delete anything and do not run git.", expected: { kind: "choice", options: ["feature/a", "feature/b", "feature/c"] } }),
            check: async (_c, e, x) => formCheck(e, x.kind, (spec) => x.options.every((o: string) => JSON.stringify(spec?.options ?? []).includes(o))),
        },
        {
            id: "mixed",
            capability: "discovery lookup and structured input",
            build: async (c) => {
                const doc: any = await c.fns.runtime.docs.get({ name: "input.kinds" });
                if (!doc) throw new Error("mixed: input.kinds is not documented");
                return { prompt: "Find the runtime function that lists the available chat input kinds, describe its options, then ask me with a confirm form whether to print the kinds. Do not print them before I answer.", expected: { name: "input.kinds", kind: "confirm" } };
            },
            check: async (_c, e, x) => {
                const form = formCheck(e, x.kind, () => true);
                // The answer may live in prose or in the form the model opened for the person.
                const named = [e.text, ...e.inputs.map((i) => `${i.title ?? ""}\n${i.message ?? ""}\n${JSON.stringify(i.spec ?? {})}`)].some((t) => t.includes(x.name));
                return { pass: form.pass && named, detail: `${form.detail} named=${named}` };
            },
        },
        {
            id: "large_result",
            capability: "stored-result read",
            build: async (c, dir) => {
                const lines: string[] = [];
                for (let i = 1; i <= 1400; i += 1) lines.push(`L${String(i).padStart(4, "0")} ${rand(20)}`);
                const target = 600 + Math.floor(Math.random() * 200);
                const token = (lines[target - 1] ?? "").split(" ")[1];
                await c.fns.files.write({ path: dir + "/data.txt", content: lines.join("\n") + "\n" });
                const label = `L${String(target).padStart(4, "0")}`;
                return {
                    prompt: `Run exactly \`cat data.txt\` once in the working directory and work only from that single raw output. Do not use grep, sed, awk, head, tail, cut, line ranges, or any other filtering command, and do not read the file another way. From that output, quote the exact token on the line labelled ${label}. Answer with one line: token=<value>.`,
                    expected: { token },
                };
            },
            exercised: (e) => e.storedResults > 0,
            check: async (_c, e, x) => {
                const m = /token\s*=\s*`?([A-Za-z0-9]+)/.exec(e.finalText) ?? /token\s*=\s*`?([A-Za-z0-9]+)/.exec(e.text);
                return { pass: m?.[1] === x.token, detail: `answer=${m?.[1] ?? "-"} expected=${x.token} stored=${e.storedResults}` };
            },
        },
        {
            id: "plan",
            capability: "visible plan",
            build: async () => {
                const marks = [rand(6), rand(6), rand(6)];
                return {
                    prompt: `Create your visible plan titled "bench" with exactly three tasks, ids s1, s2, s3. Task sN: write the file stepN.txt in the working directory containing exactly PLAN-<mark>, where the marks are s1=${marks[0]}, s2=${marks[1]}, s3=${marks[2]}. Execute the tasks in order and mark each plan task done right after its file is written. Finally answer plan=done.`,
                    expected: { marks },
                };
            },
            check: async (c, e, x) => {
                const plan = e.scratchpad?.plan;
                const tasks: any[] = Array.isArray(plan?.tasks) ? plan.tasks : [];
                const idsOk = JSON.stringify(tasks.map((t) => t.id)) === JSON.stringify(["s1", "s2", "s3"]);
                const doneOk = tasks.length === 3 && tasks.every((t) => t.status === "done");
                let filesOk = true;
                for (let i = 0; i < 3; i += 1) {
                    const p = e.dir + `/step${i + 1}.txt`;
                    const body = (await c.fns.files.exists({ path: p })) ? String((await c.fns.files.read({ path: p })) ?? "").trim() : "";
                    if (body !== `PLAN-${x.marks[i]}`) filesOk = false;
                }
                return { pass: idsOk && doneOk && filesOk, detail: `ids=${idsOk} allDone=${doneOk} files=${filesOk} states=${tasks.map((t) => t.status).join(",")}` };
            },
        },
        {
            id: "delegate",
            capability: "delegation",
            waitForChildren: true,
            build: async (c, dir) => {
                const count = 7 + Math.floor(Math.random() * 9);
                await c.fns.files.mkdir({ path: dir + "/items/sub" });
                for (let i = 0; i < count; i += 1) await c.fns.files.write({ path: `${dir}/items/f${i}-${rand(4)}.txt`, content: "x\n" });
                await c.fns.files.write({ path: dir + "/items/sub/nested.txt", content: "x\n" });
                return {
                    prompt: "Delegate this to a child agent (one task, do not count yourself): count the regular files directly inside the items/ directory of this workspace, not recursing into subdirectories, and finish with result { count: <number> }. After delegating, end your turn; when the child's result arrives, answer count=<number>.",
                    expected: { count },
                };
            },
            check: async (_c, e, x) => {
                const child = e.children[0];
                if (!child) return { pass: false, detail: "no delegated child" };
                const meta = child.scratchpad?.delegation ?? {};
                const result = meta.result?.result;
                const got = typeof result === "number" ? result : Number(result?.count ?? NaN);
                const ok = meta.status === "ready" && got === x.count;
                return { pass: ok, detail: `children=${e.children.length} status=${meta.status ?? "-"} result=${JSON.stringify(result ?? null)} expected=${x.count}` };
            },
        },
    ];
    
    function formCheck(e: Evidence, kind: string, specOk: (spec: any) => boolean) {
        const forms = e.inputs;
        const form = forms[0];
        const waited = form?.spec?._agentWait === true;
        const idx = e.calls.findIndex(calledRequest);
        const last = idx >= 0 && idx === e.calls.length - 1;
        const ok = forms.length === 1 && form?.kind === kind && waited && specOk(form?.spec) && last;
        return { pass: ok, detail: `forms=${forms.length} kind=${form?.kind ?? "-"} waited=${waited} spec=${form ? specOk(form.spec) : false} lastCall=${last}` };
    }
    
    async function tree(rootId: string): Promise<string[]> {
        const rows: any[] = await ctx.fns.procs.db.select({ sql: "WITH RECURSIVE t(id) AS (SELECT ?::text UNION SELECT a.id FROM agents a JOIN t ON a.parent_id = t.id) SELECT id FROM t", params: [rootId] });
        return rows.map((r) => String(r.id));
    }
    
    async function collect(root: types.agent.Agent, dir: string, finalText: string): Promise<Evidence> {
        const ids = await tree(root.id);
        const childIds = ids.filter((id) => id !== root.id);
        const calls: Call[] = [];
        let rejected = 0, storedResults = 0;
        const byTool: Record<string, number> = {};
        const assistantText: string[] = [];
        for (const id of ids) {
            const msgs: any[] = await ctx.fns.session.getMessages({ id, includeExcluded: true });
            for (const m of msgs) {
                if (m.role === "assistant") {
                    if (id === root.id && typeof m.content === "string") assistantText.push(m.content);
                    for (const tc of m.tool_calls ?? []) {
                        const call = { agentId: id, name: String(tc?.name ?? "?"), args: tc?.args };
                        if (id === root.id) calls.push(call);
                        byTool[call.name] = (byTool[call.name] ?? 0) + 1;
                    }
                }
                if (m.role === "tool") {
                    if (isRejected(typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""))) rejected += 1;
                    if (m.result_ref) storedResults += 1;
                }
            }
        }
        const usage: any[] = await ctx.fns.procs.db.select({ sql: "SELECT agent_id, payload FROM events WHERE type = 'context_usage' AND agent_id = ANY(?::text[])", params: [ids] });
        const tokens = { prompt: 0, completion: 0, cacheRead: 0 };
        let turns = 0, childTurns = 0;
        for (const row of usage) {
            const p = JSON.parse(String(row.payload ?? "{}"));
            tokens.prompt += Number(p?.usage?.prompt_tokens ?? 0);
            tokens.completion += Number(p?.usage?.completion_tokens ?? 0);
            tokens.cacheRead += Number(p?.usage?.cache_read_tokens ?? 0);
            if (row.agent_id === root.id) turns += 1; else childTurns += 1;
        }
        const inputs: any[] = (await ctx.fns.procs.db.select({ sql: "SELECT id, agent_id, kind, state, title, message, spec FROM inputs WHERE agent_id = ANY(?::text[]) ORDER BY created_at", params: [ids] })).map((r: any) => ({ ...r, spec: typeof r.spec === "string" ? JSON.parse(r.spec) : r.spec }));
        const rows: any[] = await ctx.fns.procs.db.select({ sql: "SELECT id, scratchpad FROM agents WHERE id = ANY(?::text[])", params: [ids] });
        const pad = (id: string) => { const raw = rows.find((r) => r.id === id)?.scratchpad; return typeof raw === "string" ? JSON.parse(raw) : (raw ?? {}); };
        const totalCalls = Object.values(byTool).reduce((a, b) => a + b, 0);
        return { dir, finalText, text: [finalText, ...assistantText].join("\n"), calls, byTool, totalCalls, rejected, storedResults, tokens, turns, childTurns, inputs, scratchpad: pad(root.id), children: childIds.map((id) => ({ id, scratchpad: pad(id) })), agentIds: ids };
    }
    
    async function settleChildren(rootId: string, deadline: number) {
        while (Date.now() < deadline) {
            const ids = await tree(rootId);
            const rows: any[] = await ctx.fns.procs.db.select({ sql: "SELECT id, run_state, next_run_at, scratchpad FROM agents WHERE id = ANY(?::text[])", params: [ids] });
            const children = rows.filter((r) => r.id !== rootId);
            const pending: any[] = await ctx.fns.procs.db.select({ sql: "SELECT count(*)::int AS n FROM session_inbound_deliveries WHERE agent_id = ANY(?::text[]) AND delivered_at IS NULL", params: [ids] });
            const quiet = rows.every((r) => r.run_state === "idle" && r.next_run_at == null) && Number(pending[0]?.n ?? 0) === 0;
            const finished = children.length > 0 && children.every((r) => { const s = typeof r.scratchpad === "string" ? JSON.parse(r.scratchpad) : (r.scratchpad ?? {}); return s?.delegation?.status === "ready"; });
            if (quiet && (finished || children.length === 0)) return;
            await sleep(2000);
        }
    }
    
    async function cleanup(ids: string[]): Promise<{ cancelled: string[]; stillOpen: number }> {
        for (const id of ids) {
            const live = await ctx.fns.session.load({ id });
            if (live) { try { await ctx.fns.agent.stop({ agent: live }); } catch { /* already idle */ } }
        }
        const open: any[] = await ctx.fns.procs.db.select({ sql: "SELECT id FROM inputs WHERE agent_id = ANY(?::text[]) AND state IN ('open','processing')", params: [ids] });
        const cancelled: string[] = [];
        for (const row of open) {
            await ctx.fns.input.submit({ id: String(row.id), cancel: true, reason: "benchmark run finished", actor: "system:bench" });
            cancelled.push(String(row.id));
        }
        const left: any[] = await ctx.fns.procs.db.select({ sql: "SELECT count(*)::int AS n FROM inputs WHERE agent_id = ANY(?::text[]) AND state IN ('open','processing')", params: [ids] });
        return { cancelled, stillOpen: Number(left[0]?.n ?? 0) };
    }
    
    async function runOne(model: string, arm: Arm, snapshot: types.agentPreset.Snapshot, sc: Scenario, rep: number, label: string, timeoutMs: number): Promise<RunRecord> {
        const dir = await ctx.fns.workspace.tmp({ path: `bench-routes/${label}/${arm}/${sc.id}-${rep}`, mkdir: true });
        await ctx.fns.files.mkdir({ path: dir });
        const started = Date.now();
        const built = await sc.build(ctx, dir);
        const child = await ctx.fns.agent.start({ model, title: `bench-routes:${arm}:${sc.id}:${rep}`, workspaceDir: dir, visibility: "hidden", systemPrompt: SYSTEM, preset: structuredClone(snapshot) });
        let finalText = "", error: string | null = null, timedOut = false;
        const timer = setTimeout(() => { timedOut = true; void ctx.fns.agent.stop({ agent: child }).catch(() => undefined); }, timeoutMs);
        try {
            const run: any = await ctx.fns.agent.run({ agent: child, userText: built.prompt });
            finalText = String(run?.text ?? "");
            if (sc.waitForChildren) await settleChildren(child.id, started + timeoutMs);
        } catch (e: any) { error = String(e?.message ?? e); }
        clearTimeout(timer);
        if (timedOut) error = (error ? error + "; " : "") + `timeout ${timeoutMs}ms`;
        const durationMs = Date.now() - started;
        const ids = await tree(child.id);
        const clean = await cleanup(ids);
        const ev = await collect(child, dir, finalText);
        let outcome: Outcome, detail: string;
        if (error) { outcome = "error"; detail = error; }
        else if (sc.exercised && !sc.exercised(ev)) { outcome = "not_exercised"; detail = `${sc.capability} not exercised`; }
        else { const c = await sc.check(ctx, ev, built.expected); outcome = c.pass ? "success" : "failure"; detail = c.detail; }
        return { arm, scenario: sc.id, repetition: rep, agentId: child.id, agentIds: ids, outcome, detail, toolCalls: ev.totalCalls, toolsByName: ev.byTool, rejected: ev.rejected, storedResults: ev.storedResults, tokens: ev.tokens, turns: ev.turns, childTurns: ev.childTurns, durationMs, openInputsCancelled: clean.cancelled, openInputsLeft: clean.stillOpen, finalText: finalText.slice(0, 400) };
    }
    
    // ---- self-test: pure checks only, no model calls ----
    const base = await ctx.fns.agentPreset.resolve(opts.presetId ? { id: opts.presetId } : {});
    const arms = buildArms(base);
    if (opts.selfTest) {
        const synthetic: Evidence = { dir: "", finalText: "token=abc", text: "token=abc", calls: [{ agentId: "x", name: "bash", args: { command: "cat data.txt | sed -n 600p" } }], byTool: { bash: 1 }, totalCalls: 1, rejected: 0, storedResults: 0, tokens: { prompt: 1, completion: 1, cacheRead: 0 }, turns: 2, childTurns: 0, inputs: [], scratchpad: {}, children: [], agentIds: ["x"] };
        const large = SCENARIOS.find((s) => s.id === "large_result")!;
        const mk = (successRate: number, exercisedTokens: number, p50Turns: number): ArmAggregate => ({ runs: 12, exercised: 12, notExercised: 0, errors: 0, success: 12, successRate, toolCalls: 0, rejected: 0, totalTokens: exercisedTokens, exercisedTokens, p50Turns, p95Turns: p50Turns });
        const missed = decide(mk(1, 1000, 2), mk(1, 930, 3));
        const metByTokens = decide(mk(1, 1000, 2), mk(1, 880, 3));
        const lowerSuccess = decide(mk(1, 1000, 2), mk(0.9, 500, 1));
        const checks = {
            armsDifferOnlyByNativeDenies: armsDiffOnlyByDenies(arms.eval, arms.native),
            nativeArmIsBasePlusNativeGrants: JSON.stringify({ ...arms.native, layers: arms.native.layers.map((l) => ({ ...l, allow: l.allow.filter((a) => !NATIVE.includes(a) || base.layers.some((b) => b.allow.includes(a))) })) }) === JSON.stringify(base),
            syntheticLargeResultNotExercised: large.exercised?.(synthetic) === false,
            thresholdMissedAt7pctWithMoreTurns: missed.met === false,
            thresholdMetAt12pctTokens: metByTokens.met === true,
            thresholdBlockedByLowerSuccess: lowerSuccess.met === false,
            rejectionPatterns: isRejected("Error: invalid arguments for read — missing required option \"path\"") && isRejected("Error: eval: typecheck failed:\n 1:2 x") && !isRejected("ok"),
        };
        return { selfTest: true, ok: Object.values(checks).every(Boolean), checks, scenarios: SCENARIOS.map((s) => ({ id: s.id, capability: s.capability })) };
    }
    
    const model = String(opts.model ?? "").trim();
    if (!model) throw new Error("bench.routes: model is required unless selfTest is true");
    if (!armsDiffOnlyByDenies(arms.eval, arms.native)) throw new Error("bench.routes: arm snapshots differ beyond the native denies");
    const wantedArms: Arm[] = (opts.arms?.length ? opts.arms : ["eval", "native"]) as Arm[];
    const wanted = opts.scenarios?.length ? SCENARIOS.filter((s) => opts.scenarios!.includes(s.id)) : SCENARIOS;
    const unknown = (opts.scenarios ?? []).filter((id) => !SCENARIOS.some((s) => s.id === id));
    if (unknown.length) throw new Error("bench.routes: unknown scenarios " + unknown.join(", "));
    const reps = Math.max(1, Math.min(10, Math.floor(opts.repetitions ?? 3)));
    const concurrency = Math.max(1, Math.min(8, Math.floor(opts.concurrency ?? 4)));
    const timeoutMs = Math.max(30_000, Math.min(1_800_000, Math.floor(opts.timeoutMs ?? 600_000)));
    const label = (opts.label ?? "routes").replace(/[^a-zA-Z0-9._-]/g, "_") + "-" + stamp();
    const jobs: Array<() => Promise<RunRecord>> = [];
    for (let rep = 1; rep <= reps; rep += 1) for (const sc of wanted) for (const arm of wantedArms) jobs.push(() => runOne(model, arm, arms[arm], sc, rep, label, timeoutMs).catch((e: any): RunRecord => ({ arm, scenario: sc.id, repetition: rep, agentId: "", agentIds: [], outcome: "error", detail: "harness: " + String(e?.message ?? e), toolCalls: 0, toolsByName: {}, rejected: 0, storedResults: 0, tokens: { prompt: 0, completion: 0, cacheRead: 0 }, turns: 0, childTurns: 0, durationMs: 0, openInputsCancelled: [], openInputsLeft: 0, finalText: "" })));
    const runs: RunRecord[] = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
        while (next < jobs.length) { const job = jobs[next++]!; runs.push(await job()); }
    }));
    runs.sort((a, b) => a.arm.localeCompare(b.arm) || a.scenario.localeCompare(b.scenario) || a.repetition - b.repetition);
    const perArm: Record<string, ArmAggregate> = {};
    for (const arm of wantedArms) perArm[arm] = aggregate(runs.filter((r) => r.arm === arm));
    const perScenario: Record<string, Record<string, ArmAggregate>> = {};
    for (const sc of wanted) { perScenario[sc.id] = {}; for (const arm of wantedArms) perScenario[sc.id]![arm] = aggregate(runs.filter((r) => r.arm === arm && r.scenario === sc.id)); }
    const decision = perArm.eval && perArm.native ? decide(perArm.eval, perArm.native) : null;
    const report = { label, at: new Date().toISOString(), model, presetId: base.presetId, nativeAdapters: NATIVE, repetitions: reps, concurrency, scenarios: wanted.map((s) => ({ id: s.id, capability: s.capability })), perArm, perScenario, decision, openInputsLeft: runs.reduce((a, r) => a + r.openInputsLeft, 0), runs };
    const outDir = import.meta.dir + "/results";
    const reportPath = `${outDir}/routes-${stamp()}.json`;
    await ctx.fns.files.mkdir({ path: outDir });
    await ctx.fns.files.write({ path: reportPath, content: JSON.stringify(report, null, 2) + "\n" });
    return { reportPath, label, perArm, perScenarioTokens: Object.fromEntries(Object.entries(perScenario).map(([id, a]) => [id, Object.fromEntries(Object.entries(a).map(([arm, x]) => [arm, x.exercisedTokens]))])), decision, openInputsLeft: report.openInputsLeft, outcomes: runs.map((r) => `${r.arm}/${r.scenario}#${r.repetition}=${r.outcome}`) };
}
