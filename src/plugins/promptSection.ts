/** Build the mounted-plugin workflow and index, omitting plugins with no reachable function. */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Frozen-preset access predicate evaluated against the live registry. */
    allows?: (name: string) => boolean;
}): string {
    // A partial discovery grant must not advertise an unusable workflow, including direct calls.
    if (opts.allows && !["plugins.search", "plugins.read", "plugins.functions"].every(opts.allows)) return "";
    const plugins = ctx.fns.plugins.list({}).filter(plugin => !opts.allows || plugin.namespaces.some((namespace: string) => {
        const node = namespace.split(".").reduce((value, key) => value?.[key], ctx.state.registry);
        return Object.entries(node ?? {}).some(([name, fn]) => typeof fn === "function" && opts.allows!(`${namespace}.${name}`));
    }));
    return plugins.length ? `## Mounted plugins\n\nPlugin layers: core runtime is built into MauzCode; official plugins ship in the MauzCode repository; user plugins live as direct children of the external \`USER_PLUGINS\` directory and are writable by the user/agent. Create substantial private integrations in \`USER_PLUGINS\`, not in the official \`plugins/\` tree; use \`.mauzcode/\` only for small project-local procedures.\n\n${plugins.map((p: any) => `- ${p.name} [${p.source}]: ${p.description || p.namespaces.join(", ")}`).join("\n")}\n\nPlugin workflow (ordinary functions, call through eval):\n1. Translate the user's capability intent into a concise English search query, regardless of the user's language.\n2. await ctx.fns.plugins.search({ query }) — search both plugin workflows (SKILL.md) and live function documentation. Do this before guessing a plugin or function name.\n3. await ctx.fns.plugins.read({ name }) — read the selected plugin's human-written workflow overview plus generated function docs, schemas and return types.\n4. Call the selected function through ctx.fns.<namespace>.<function>({ ... }).\nUse ctx.fns.plugins.functions({ name }) only for a compact generated catalogue. ${!opts.allows || ["plugins.load", "plugins.add", "plugins.remove", "plugins.reload"].every(opts.allows) ? "Manage plugins with plugins.load/add/remove/reload." : ""} Do not assume every plugin function is a native tool.` : "";
}
