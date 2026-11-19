/**
 * Test a voice connection through its provider
 *
 * Use for an explicit "Test" button or before relying on a connection. The provider's own `test` operation runs
 * without user audio; a throw or a malformed result becomes `unavailable`. The public result never repeats
 * provider text: the message is one fixed sentence per status and the reason comes from a closed set of local
 * codes — a provider reason that is not a known code is replaced by the fixed default of its status, and a
 * failing provider contributes no reason, message or error text at all, so no vendor payload or key material can
 * leak through a rewritten or misbehaving provider. The check is bounded by a deadline that also aborts the
 * provider operation; a provider that ignores the abort signal is still cut off and its late settlement is
 * discarded.
 * @param opts.id Connection UUID.
 * @param opts.timeoutMs Deadline for the provider check. @default 20000 @minimum 100 @maximum 120000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection UUID. */
        id: string;
        /** Deadline for the provider check. @default 20000 @minimum 100 @maximum 120000 */
        timeoutMs?: number;
    },
): Promise<types.voice.TestResult> {
    // Every status has exactly one public sentence; provider text is never copied into it.
    const messages: Record<types.voice.TestResult["status"], string> = {
        available: "Voice connection is ready",
        configured: "Voice connection is configured",
        disabled: "Voice connection is disabled",
        unavailable: "Voice connection check failed",
    };
    const statuses = new Set<types.voice.TestResult["status"]>(["available", "unavailable", "configured", "disabled"]);
    // The only provider reasons that may become public. A provider that invents a reason — or echoes a
    // credential that happens to look like a code — gets the fixed default of its status instead.
    const knownReasons = new Set(["voice-ok", "bad-key", "unauthorized", "unreachable", "rate-limited", "no-model", "timeout"]);
    const defaultReason: Record<types.voice.TestResult["status"], string> = {
        available: "available",
        configured: "configured",
        disabled: "disabled",
        unavailable: "check-failed",
    };
    const requested = typeof opts.timeoutMs === "number" && Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 20000;
    const budget = Math.min(Math.max(requested, 100), 120000);
    const view = await ctx.fns.voice.connections.get({ id: opts.id });
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(Object.assign(new Error("Voice connection check exceeded its deadline"), { code: "VOICE_CHECK_TIMEOUT" }));
        }, budget);
    });
    try {
        // The deadline covers the whole check: connection resolution and the provider operation.
        const work = (async () => {
            const { definition, conn } = await ctx.fns.voice.connections.resolve({ id: view.id, signal: controller.signal });
            return await definition.test(ctx, conn);
        })();
        // The provider may still settle after the deadline; that late outcome is discarded, never reported.
        work.catch(() => {});
        const result = await Promise.race([work, deadline]);
        if (!result || typeof result !== "object" || !statuses.has(result.status) || typeof result.reason !== "string") {
            throw new Error("Voice provider returned an invalid test result");
        }
        const status = result.status;
        return {
            status,
            reason: knownReasons.has(result.reason) ? result.reason : defaultReason[status],
            message: messages[status],
            checkedAt: Date.now(),
        };
    } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        const reason = code === "UNKNOWN_PROVIDER" ? "unknown-provider" : code === "TRANSPORT" ? "transport-failed" : timedOut || controller.signal.aborted ? "timeout" : "test-failed";
        return {
            status: "unavailable",
            reason,
            message: messages.unavailable,
            checkedAt: Date.now(),
        };
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}
