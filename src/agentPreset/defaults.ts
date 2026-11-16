/**
 * Return fresh shipped Standard, Creator and Minimal preset definitions.
 *
 * Use these definitions to seed missing built-ins or reset an edited built-in. Returned arrays are independent on every call. The deterministic updated_at value is zero; storage writers assign the actual write timestamp.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {},
): types.agentPreset.Preset[] {
    const catalogue = ctx.fns.agentPreset.coreCatalogue({});
    const allow = Object.values(catalogue).filter(entry => entry.classification === "standard").flatMap(entry => entry.patterns);
    return [
        { id: "standard", name: "Standard", description: "Code and task work with specification, review, research and browser plugins; no runtime management.", sort_order: 10, allow, plugins: ["openspec", "git", "websearch", "browser", "gh", "terminal", "glab"] },
        { id: "creator", name: "Creator", description: "All runtime functions and all installed plugins; not a sandbox.", sort_order: 20, allow: ["*"], plugins: ["*"] },
        { id: "minimal", name: "Minimal", description: "Shell and read, write and edit tools only.", sort_order: 30, allow: ["tools.bash", "tools.read", "tools.write", "tools.edit"], plugins: [] },
    ].map(preset => ({ ...preset, builtin: true, deny: [], exclude_sections: [], prompt: "", updated_at: 0 }));
}
