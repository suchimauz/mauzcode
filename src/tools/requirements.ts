/**
 * Lists the exact runtime functions a declared tool needs: its implementation plus its `requires` entries.
 *
 * Returns null for a malformed `requires` value, which callers must treat as denied so a broken declaration fails closed.
 * @param opts.tool Registered tool declaration as returned by `tools.list`.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Registered tool declaration as returned by `tools.list`. */
        tool: { module: string; name: string; fn?: string; requires?: unknown };
    },
): string[] | null {
    const { tool } = opts;
    const own = tool.fn ?? `${tool.module}.${tool.name}`;
    if (tool.requires === undefined) return [own];
    if (!Array.isArray(tool.requires) || !tool.requires.every(name => typeof name === "string" && name)) return null;
    return [own, ...tool.requires as string[]];
}
