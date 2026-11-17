// The canvas equivalent of input.promptSection: the system prompt lists the kinds that are actually
// loaded, so a plugin's kind is advertised exactly while it is mounted.
/**
 * Builds the system-prompt block that tells agents how to show things on the canvas beside the chat and lists the loaded kinds.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Restrict advertised kinds and launch functions to reachable capabilities. */
    allows?: (name: string) => boolean;
    /** Teach the native show_artifact tool for files; set only when the agent can call it. */
    native?: boolean;
}): Promise<string> {
    // Built-in kinds are described in full; plugin kinds and the functions that show their result on the
    // canvas are only named — canvas.search finds them with their args, so the prompt does not grow
    // with every mounted plugin.
    const visible = (...requires: string[]) => ctx.fns.agentPreset.discoveryVisible({ requires, allows: opts.allows });
    const all = (await ctx.fns.canvas.kinds({ allows: opts.allows })).filter(k => k.hint);
    if (!visible("canvas.show")) return "";
    if (!all.length) return "";
    const kinds = all.filter(k => k.module === "canvas");
    const plugin = all.filter(k => k.module !== "canvas").map(k => k.name);
    const shows = (await ctx.fns.canvas.search({ limit: 100, allows: opts.allows })).filter(r => r.type === "function" && (!opts.allows || opts.allows(r.name))).map(r => r.name);
    return [
        "## Canvas",
        "",
        "A large surface left of the chat where you can put something in front of the person — a file, document or diagram. Open a tab with `await ctx.fns.canvas.show({ kind, args, title? })`; it becomes active and the canvas opens. When the canvas changes you get a short `Canvas` block saying what is open.",
        ...(visible("canvas.list") ? ["`canvas.list({})` shows the tabs; `canvas.list({ closed: true })` lists recently closed tabs with their `closedAt`."] : []),
        ...(visible("canvas.close") ? ["`canvas.close({ itemId })` marks a tab closed; it is kept for 30 days."] : []),
        ...(visible("canvas.reopen") ? ["`canvas.reopen({ itemId })` brings a closed tab back with its state."] : []),
        ...(visible("canvas.setState") ? ["`canvas.setState({ itemId, state })` remembers a tab's own state."] : []),
        "",
        "When the person asks to open, show or look at a file, a README, a document or a picture, put it on the canvas. Only the canvas region refreshes; the chat, drafts and scroll stay. Showing the same thing again just switches to its tab. Relative paths resolve in your workspace; for another project pass an absolute path.",
        "",
        ...(visible("ui.openFile") ? ["Use the canvas — not `ui.openFile`, which navigates the whole page away from the chat."] : []),
        ...(all.some(k => k.name === "file") ? [opts.native
            ? "To show a file beside the chat, call the show_artifact tool ({ path, title?, host?, mode? }); it opens your own canvas. Use canvas.show for other kinds."
            : 'To show files beside chat, use canvas.show with kind:"file".'] : []),
        ...kinds.map(k => `- \`${k.name}\` — ${k.hint!.trim()}`),
        ...(plugin.length && visible("canvas.search") ? [`- plugin kinds: ${plugin.map(n => `\`${n}\``).join(", ")} — their args via \`canvas.search({ query })\``] : []),
        "",
        ...(visible("canvas.search") ? ["Some functions return data AND can show the same selection on the canvas (`@canvas <kind>` in their docs; `canvas.search({ query })` finds them). When you answer from such data, call them with `canvas: true` so the person sees exactly what you read; they reuse the tab and return its `itemId`. What the person then changes in that tab (filter, opened record) arrives in the Canvas block — repeat the call without `canvas` to read the same data."
            + (shows.length ? ` Loaded: ${shows.map(n => `\`${n}\``).join(", ")}.` : "")] : []),
    ].join("\n");
}
