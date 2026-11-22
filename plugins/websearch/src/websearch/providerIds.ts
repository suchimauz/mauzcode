/**
 * Returns the ids of registered web search providers, sorted; the dynamic options of `websearch.defaultEngine`.
 */
export default function (ctx: Context, _session: Session | null, _opts?: {}): string[] {
    return Object.keys(ctx.state.websearch?.providers ?? {}).sort();
}
