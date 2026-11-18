/** Creates, cancels, or makes due unified agent triggers from the inspector form. Requires owner authorization and a cookie-bound CSRF token (`x-csrf-token` header or `csrf` form field); `run` uses the shared make-due operation. */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
  const id = String(opts.params.id ?? "");
  try {
    const form = await opts.req.formData();
    await ctx.fns.goal.surfaceAuthorize({ req: opts.req, agentId: id, csrfToken: opts.req.headers.get("x-csrf-token") ?? String(form.get("csrf") ?? "") });
    const action = String(form.get("action") ?? "");
    if (action === "wake") {
      const minutes = Math.max(1, Math.min(10080, Number(form.get("minutes") ?? 5)));
      await ctx.fns.agent.wake({ id, inMs: minutes * 60_000, prompt: String(form.get("prompt") ?? "Continue scheduled work") });
    } else if (action === "cron") {
      await ctx.fns.agent.cron({ id, expression: String(form.get("expression") ?? "0 9 * * *"), timezone: String(form.get("timezone") ?? "UTC"), prompt: String(form.get("prompt") ?? "").trim() });
    } else if (action === "watch") {
      const predicate = String(form.get("predicate") ?? "file.exists") as "file.exists" | "db.rows" | "http.ok" | "runtime.fn";
      const value = String(form.get("value") ?? "").trim();
      const predicateOpts: Record<string, any> = predicate === "file.exists" ? { path: value } : predicate === "http.ok" ? { url: value } : predicate === "db.rows" ? { sql: value, params: [] } : { name: value, args: {} };
      const timeoutMinutes = Number(form.get("timeoutMinutes") ?? 0);
      await ctx.fns.agent.watch({ id, predicate, opts: predicateOpts, prompt: String(form.get("prompt") ?? "Condition met").trim(), everyMs: Math.max(5000, Number(form.get("everySeconds") ?? 60) * 1000), ...(timeoutMinutes > 0 ? { timeoutMs: timeoutMinutes * 60_000 } : {}), mode: String(form.get("mode") ?? "once") === "edge" ? "edge" : "once", ...(String(form.get("onTimeoutPrompt") ?? "").trim() ? { onTimeoutPrompt: String(form.get("onTimeoutPrompt")) } : {}) });
    } else if (action === "cancel") {
      await ctx.fns.agent.cancelTrigger({ id, triggerId: String(form.get("triggerId") ?? "") });
    } else if (action === "cancelAll") {
      await ctx.fns.agent.cancelAllTriggers({ id });
    } else if (action === "run") {
      await ctx.fns.agent.runTriggerNow({ id, triggerId: String(form.get("triggerId") ?? "") });
    } else throw new Error("Unsupported trigger action");
    ctx.fns.events.refreshAgentMeta({ agentId: id, section: "automation", reason: "trigger-changed" });
    return new Response(null, { status: 204, headers: { "HX-Trigger": "agent-meta-refresh" } });
  } catch (error: any) {
    return new Response(String(error?.message ?? error), { status: typeof error?.status === "number" ? error.status : 400 });
  }
}
