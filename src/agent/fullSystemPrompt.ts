import { resolve } from "node:path";

/** Assemble capability-scoped guidance using live registry origins and frozen preset rules. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Live agent whose immutable preset, workspace and additive instructions are used. */
    agent: types.agent.Agent;
}): Promise<string> {
    const { agent } = opts;
    const allows = (agent.preset && ctx.fns.agentPreset.predicate({ snapshot: agent.preset })) || (() => true);
    // The native read tool replaces the eval recipe only when this agent can actually call it.
    const nativeFns = new Set(typeof ctx.fns.agent?.wireTools === "function"
        ? ctx.fns.agent.wireTools({ agent }).flatMap(tool => ctx.fns.tools.list({}).filter(t => t.wireName === tool.name).map(t => String(t.fn)))
        : []);
    const nativeReadResult = nativeFns.has("tools.readResult");
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
                case "input.promptSection": body = ctx.fns.input.promptSection({ allows, native: nativeFns.has("tools.requestInput") }); break;
                case "canvas.promptSection": body = await ctx.fns.canvas.promptSection({ allows }); break;
                case "plugins.promptSection": body = ctx.fns.plugins.promptSection({ allows }); break;
                default: {
                    const generator = section.generator.split(".").reduce((node, key) => node?.[key], ctx.fns as any);
                    if (typeof generator !== "function") throw new Error(`Prompt ${section.id}: missing generator ${section.generator}`);
                    body = await generator({ allows });
                }
            }
        }
        // Optional guidance stays inside its original section so existing exclusions still win.
        // Keep mandatory safety text in the section body even when an auxiliary API is denied.
        if (section.id === "eval" && allows("agent.readResult")) {
            body += nativeReadResult
                ? '\n\nBig tool results have a bounded preview and immutable result UUID. Read ranges with the read_result tool ({ id: "<uuid>", offset: 0, limit: 4000 }); inspect ok, text and truncated before reading more. Do not rerun a tool or read scratchpad.results to recover output. Old rN references are unavailable; a storage-failure preview has no full saved result.'
                : '\n\nBig tool results have a bounded preview and immutable result UUID. Read ranges with await ctx.fns.agent.readResult({ id: "<uuid>", offset: 0, limit: 4000 }); inspect ok, text and truncated before reading more. Do not rerun a tool or read scratchpad.results to recover output. Old rN references are unavailable; a storage-failure preview has no full saved result.';
        }
        // Native plan/delegation tools replace the eval recipes only when this agent can call them.
        if (section.id === "plans" && nativeFns.has("tools.planUpdate") && nativeFns.has("tools.planDone")) {
            body += '\n\nPrefer the plan_update tool to create or revise your plan and the plan_done tool to close the active task; they act on your own plan without eval.';
        }
        if (section.id === "delegation" && nativeFns.has("tools.delegateTask")) {
            body += '\n\nPrefer the delegate_task tool ({ title, tasks, presetId? }); it returns the child id at once. End your turn after delegating: the result arrives as a team update.';
        }
        if (section.id === "agentMessaging" && allows("agent.search")) {
            body += '\n\nFind an ordinary agent by title or id with await ctx.fns.agent.search({ query, limit }); use its exact returned id for messaging. Shared agents are published reusable context, not ordinary chat lookup.';
        }
        if (section.id === "sharedAgents") {
            if (allows("sharedAgent.list")) body += '\n\nSearch for relevant shared context first with await ctx.fns.sharedAgent.list({ query }).';
            if (allows("sharedAgent.result")) body += '\n\nRead sharedAgent results with await ctx.fns.sharedAgent.result({ childId }) only when needed.';
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
