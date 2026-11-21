/**
 * Ensure the Gemini connection has a Code Assist project, onboarding the account when needed
 *
 * Code Assist setup of the gemini provider, following Gemini CLI `code_assist/setup.ts`. Returns the stored project when one exists (unless `force`). Otherwise calls `loadCodeAssist`: a reported companion project is stored with the current tier (the paid tier preferred). Without a project and current tier it onboards the account to the default allowed tier — the free tier without a project — through `onboardUser` and polls the long-running operation every few seconds until it reports a project, for at most two minutes. Fails with safe errors instead of guessing: VALIDATION_REQUIRED (with Google's validation link) when an ineligible tier requires account validation, INELIGIBLE with the reported reason messages when tiers are ineligible and no project exists, PROJECT_REQUIRED when the tier needs a user-defined Google Cloud project, and a retryable SETUP_TIMEOUT when onboarding does not finish in time. One setup runs at a time per connection; concurrent callers share it. Every request goes through models.provider.gemini.request (the connection transport).
 * @param opts.conn Resolved gemini connection.
 * @param opts.force Run setup even when a project is stored. @default false
 * @param opts.pollMs Override of the operation poll interval, for tests. @minimum 1 @maximum 60000
 * @param opts.timeoutMs Override of the two-minute onboarding limit, for tests. @minimum 1 @maximum 600000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection. */
        conn: types.models.ResolvedConnection;
        /** Run setup even when a project is stored. @default false */
        force?: boolean;
        /** Override of the operation poll interval, for tests. @minimum 1 @maximum 60000 */
        pollMs?: number;
        /** Override of the two-minute onboarding limit, for tests. @minimum 1 @maximum 600000 */
        timeoutMs?: number;
    },
): Promise<{ projectId: string; tier: { id: string; name?: string } | null }> {
    const { conn } = opts;
    const k = ctx.fns.models.provider.gemini.constants({});
    if (!opts.force) {
        const s = await ctx.fns.models.provider.gemini.auth({ conn, op: "status" });
        if (s.projectId) return { projectId: s.projectId, tier: s.tier };
    }
    ctx.state.models ??= {};
    const inflight = (ctx.state.models.geminiSetup ??= {});
    const fail = (message: string, code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { code, status: 409, retryable: false, ...extra });
    type Tier = { id?: string; name?: string; isDefault?: boolean; userDefinedCloudaicompanionProject?: boolean };
    type Ineligible = { reasonCode?: string; reasonMessage?: string; tierId?: string; tierName?: string; validationUrl?: string };
    const metadata = { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" };
    const post = async (method: string, body: Record<string, unknown>) => {
        const res = await ctx.fns.models.provider.gemini.request({ conn, method, body });
        return await res.json().catch(() => ({})) as Record<string, any>;
    };
    const tierOf = (t: Tier | undefined | null) => t && typeof t.id === "string" && t.id ? { id: t.id, ...(typeof t.name === "string" && t.name ? { name: t.name } : {}) } : null;
    const ineligibleError = (list: Ineligible[]) => {
        const reasons = list.map(t => typeof t.reasonMessage === "string" ? t.reasonMessage.replace(/\s+/g, " ").trim().slice(0, 300) : "").filter(Boolean);
        return reasons.length
            ? fail("Gemini Code Assist is not available for this account: " + reasons.join("; "), "INELIGIBLE")
            : fail("This Google account needs its own Google Cloud project for Gemini Code Assist, which this provider does not support", "PROJECT_REQUIRED");
    };
    const run = async (): Promise<string> => {
        const load = await post("loadCodeAssist", { metadata });
        const ineligible: Ineligible[] = Array.isArray(load.ineligibleTiers) ? load.ineligibleTiers : [];
        const project = typeof load.cloudaicompanionProject === "string" && load.cloudaicompanionProject ? load.cloudaicompanionProject : "";
        if (load.currentTier) {
            if (!project) throw ineligibleError(ineligible);
            const tier = tierOf(load.paidTier) ?? tierOf(load.currentTier);
            await ctx.fns.models.provider.gemini.auth({ conn, op: "setup", setup: { projectId: project, ...(tier ? { tier } : {}) } });
            return project;
        }
        const validation = ineligible.find(t => t.reasonCode === "VALIDATION_REQUIRED" && typeof t.validationUrl === "string" && /^https:\/\//.test(t.validationUrl));
        if (validation) throw fail("Google requires you to verify this account before using Gemini Code Assist: " + validation.validationUrl, "VALIDATION_REQUIRED", { validationUrl: validation.validationUrl });
        const allowed: Tier[] = Array.isArray(load.allowedTiers) ? load.allowedTiers : [];
        const chosen: Tier = allowed.find(t => t?.isDefault) ?? { id: "legacy-tier", userDefinedCloudaicompanionProject: true };
        if (chosen.userDefinedCloudaicompanionProject && !project) {
            if (ineligible.some(t => t.reasonMessage)) throw ineligibleError(ineligible);
            throw fail("This Google account needs its own Google Cloud project for Gemini Code Assist, which this provider does not support", "PROJECT_REQUIRED");
        }
        let op = await post("onboardUser", { tierId: chosen.id, ...(chosen.id !== "free-tier" && project ? { cloudaicompanionProject: project } : {}), metadata });
        const deadline = Date.now() + (opts.timeoutMs ?? k.setupTimeoutMs);
        while (!op.done) {
            if (Date.now() >= deadline || typeof op.name !== "string" || !op.name) throw Object.assign(new Error("Gemini Code Assist onboarding did not finish in time; try again"), { code: "SETUP_TIMEOUT", status: 504, retryable: true });
            await Bun.sleep(Math.min(opts.pollMs ?? k.setupPollMs, Math.max(0, deadline - Date.now())));
            const res = await ctx.fns.models.provider.gemini.request({ conn, path: op.name });
            op = await res.json().catch(() => ({})) as Record<string, any>;
        }
        const onboarded = op.response?.cloudaicompanionProject?.id;
        const projectId = typeof onboarded === "string" && onboarded ? onboarded : project;
        if (!projectId) throw ineligibleError(ineligible);
        const tier = tierOf(chosen);
        await ctx.fns.models.provider.gemini.auth({ conn, op: "setup", setup: { projectId, ...(tier ? { tier } : {}) } });
        return projectId;
    };
    inflight[conn.id] ??= run().finally(() => { delete inflight[conn.id]; });
    const projectId = await inflight[conn.id]!;
    const s = await ctx.fns.models.provider.gemini.auth({ conn, op: "status" });
    return { projectId, tier: s.tier };
}
