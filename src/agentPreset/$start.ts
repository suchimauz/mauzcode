/** Restore missing built-ins after schema migrations and before agents resume. */
export default async function (ctx: Context, _session: Session | null, _opts: {}): Promise<void> {
    await ctx.fns.agentPreset.ensureBuiltins({});
}
