/**
 * Register capability prompt sections from Markdown frontmatter. Reloading the same
 * source replaces its section; different sources must never claim the same ID.
 * @param opts.entries Scanner entries for core, project or plugin prompt files.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Prompt declaration files discovered by the scanner. */
    entries: { abs: string; rel: string }[];
}): Promise<void> {
    const state = (ctx.state.prompts ??= { registry: new Map(), generation: 0 });
    const next = new Map(state.registry);
    for (const entry of opts.entries) {
        const text = await Bun.file(entry.abs).text();
        const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.replace(/^\uFEFF/, ""));
        if (!match) throw new Error(`Prompt ${entry.rel}: frontmatter is required`);
        const data = Bun.YAML.parse(match[1]!) as Record<string, unknown>;
        if (!data || typeof data.id !== "string" || !data.id.trim()) throw new Error(`Prompt ${entry.rel}: id is required`);
        if (typeof data.title !== "string" || !data.title.trim()) throw new Error(`Prompt ${entry.rel}: title is required`);
        if (!Array.isArray(data.requires) || data.requires.some(value => typeof value !== "string" || !value.trim())) throw new Error(`Prompt ${entry.rel}: requires must be an array of function names`);
        if (typeof data.order !== "number" || !Number.isFinite(data.order)) throw new Error(`Prompt ${entry.rel}: order must be finite`);
        if (data.generator !== undefined && (typeof data.generator !== "string" || !/^[\w]+(?:\.[\w]+)+$/.test(data.generator))) throw new Error(`Prompt ${entry.rel}: invalid generator`);
        const previous = next.get(data.id) as { abs: string } | undefined;
        if (previous && previous.abs !== entry.abs) throw new Error(`Prompt ${entry.rel}: duplicate id ${data.id}`);
        // An ID rename at the same path must not leave stale prompt prose behind.
        for (const [id, section] of next) if ((section as { abs: string }).abs === entry.abs) next.delete(id);
        next.set(data.id, { id: data.id, title: data.title, requires: data.requires, order: data.order,
            generator: data.generator, body: match[2]!.trim(), abs: entry.abs, rel: entry.rel });
    }
    state.registry = next;
    state.generation = (state.generation ?? 0) + 1;
}
