import { resolve } from "node:path";

/** Assemble capability-scoped guidance using live registry origins and frozen preset rules. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Live agent whose immutable preset, workspace and additive instructions are used. */
    agent: types.agent.Agent;
}): Promise<string> {
    const { agent } = opts;
    const allows = (name: string) => !agent.preset || ctx.fns.agentPreset.allows({ snapshot: agent.preset, name });
    const excluded = new Set(agent.preset?.layers.flatMap(layer => layer.excludeSections) ?? []);
    const sections = [...(ctx.state.prompts?.registry?.values() ?? [])] as { id: string; order: number; requires: string[]; body: string; generator?: string }[];
    const blocks = [await Bun.file(resolve(import.meta.dir, "SYSTEM_PROMPT_BASE.md")).text()];
    for (const section of sections.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
        if (excluded.has(section.id) || !section.requires.every(allows)) continue;
        let body = section.body;
        if (section.generator) {
            // Explicit core calls retain call-graph coverage; plugins resolve through the public registry.
            switch (section.generator) {
                case "tools.promptSection": body = ctx.fns.tools.promptSection({ protocol: "json", only: agent.tools, allows }); break;
                case "markdown.promptSection": body = await ctx.fns.markdown.promptSection({ allows }); break;
                case "input.promptSection": body = ctx.fns.input.promptSection({ allows }); break;
                case "canvas.promptSection": body = await ctx.fns.canvas.promptSection({ allows }); break;
                case "plugins.promptSection": body = ctx.fns.plugins.promptSection({ allows }); break;
                default: {
                    const generator = section.generator.split(".").reduce((node, key) => node?.[key], ctx.fns as any);
                    if (typeof generator !== "function") throw new Error(`Prompt ${section.id}: missing generator ${section.generator}`);
                    body = await generator({ allows });
                }
            }
        }
        if (body?.trim()) blocks.push(body.trim());
    }
    const additions = agent.preset?.layers.map(layer => layer.prompt.trim()).filter(Boolean) ?? [];
    if (additions.length) blocks.push("## Preset instructions\n\n" + additions.join("\n\n"));
    if (agent.systemPrompt?.trim()) blocks.push("## Per-agent instructions\n\n" + agent.systemPrompt.trim());
    blocks.push([
        "## Runtime context (auto-injected, fresh each turn)",
        agent.workspaceHost ? `- workspace: ${agent.workspaceHost}:${agent.workspaceDir} — REMOTE, on SSH host ${agent.workspaceHost}` : `- workspace directory: ${agent.workspaceDir || process.cwd()}`,
        "- workspace is a base directory, not a sandbox",
    ].join("\n"));
    return blocks.join("\n\n");
}
