/** Return the cached Claude CLI version, preserving the string API for existing callers. */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Exact configured SSH instance name; omitted detects the local CLI. */
        instance?: string;
        /** Discard this destination's cached detection. */
        refresh?: boolean;
    },
): Promise<string> {
    return (await ctx.fns.models.provider.claude.claudeCliVersionDetection({ instance: opts.instance, refresh: opts.refresh })).value;
}
