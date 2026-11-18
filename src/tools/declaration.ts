// Find the loaded declaration a call name refers to — for presentation, not
// execution, so it deliberately ignores presets and availability: a call to a
// tool the agent may no longer use still has a label and an icon.
//
// One place defines how call names map to declarations: exact wire name, short
// name or registry key; then the last dotted segment (`plugin.tool` → `tool`);
// then the historical alias `tools_eval` → `eval`.
const ALIASES: Record<string, string> = { tools_eval: "eval" };

/**
 * Looks up the loaded tool declaration for a call name, including mounted plugin tools that the caller's preset does not grant.
 *
 * Use when presenting a recorded or running call; returns null for names no loaded declaration claims (removed plugins, historical tools).
 * @param opts.name Call name as stored in the transcript or registry: wire name, short name, dotted name or a known alias.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Call name as stored in the transcript or registry: wire name, short name, dotted name or a known alias. */
        name: string;
    },
): (types.tools.Tool & { key: string; name: string; wireName: string }) | null {
    const name = String(opts.name ?? "");
    if (!name) return null;
    const all: any[] = ctx.fns.tools.list({});
    const find = (n: string) => all.find(t => t.wireName === n) ?? all.find(t => t.key === n) ?? all.find(t => t.name === n);
    const short = name.split(".").pop() || name;
    return find(name) ?? find(short) ?? (ALIASES[short] ? find(ALIASES[short]!) : undefined) ?? null;
}
