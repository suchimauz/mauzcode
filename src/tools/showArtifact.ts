/**
 * Native `show_artifact` adapter: opens a workspace file or directory on the invoking agent's canvas.
 *
 * Delegates to `canvas.show` with kind `file` and the agent id bound from the trusted tool invocation, so
 * path resolution, existence checks, deduplication and reopen semantics are identical to the eval route.
 * Rejects unknown arguments, including any canvas kind or agent selector; never accepts an owner from
 * arguments and never falls back to a current agent.
 * @param opts.path File or directory path, relative to the invoking agent's workspace or absolute.
 * @param opts.title Tab title; defaults to the file kind's suggestion.
 * @param opts.host SSH host alias the path lives on; omitted means the agent workspace.
 * @param opts.mode Initial file view: auto lets the Files UI choose. @default auto
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** File or directory path, relative to the invoking agent's workspace or absolute. */
        path: string;
        /** Tab title; defaults to the file kind's suggestion. */
        title?: string;
        /** SSH host alias the path lives on; omitted means the agent workspace. */
        host?: string;
        /** Initial file view: auto lets the Files UI choose. @default auto */
        mode?: "auto" | "preview" | "source";
    },
): Promise<{ itemId: number; title: string; path: string; host: string }> {
    const unknown = Object.keys(opts ?? {}).filter(key => !["path", "title", "host", "mode"].includes(key));
    if (unknown.length) throw new Error(`show_artifact: unknown argument ${unknown.join(", ")}`);
    const agent = session?.agent;
    if (!agent?.id) throw new Error("show_artifact: requires a trusted agent invocation");
    if (typeof opts.path !== "string" || !opts.path.trim()) throw new Error("show_artifact: path must be a non-empty string");
    // The file kind resolves the path against this agent's workspace, pins it absolute and checks existence.
    const item = await ctx.fns.canvas.show({
        kind: "file",
        args: { path: opts.path.trim(), host: opts.host, mode: opts.mode },
        title: opts.title,
        agentId: agent.id,
    });
    return { itemId: item.id, title: item.title, path: String(item.args.path), host: String(item.args.host ?? "local") };
}
