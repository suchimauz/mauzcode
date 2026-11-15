/**
 * Lists the canvas kinds that are loaded (file and plugin kinds) with what each shows and its args.
 * Use before canvas.show to see what can be opened on an agent's canvas.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Internal capability predicate; scoped discovery omits kinds without required-function metadata. */
    allows?: (name: string) => boolean;
}): Promise<Array<{ name: string; module: string; hint: string | null }>> {
    const kinds = ((ctx.state as any).canvas?.kinds ?? {}) as Record<string, types.canvas.Registered>;
    return await Promise.all(Object.values(kinds).filter(k => ctx.fns.agentPreset.discoveryVisible({ requires: k.requires, allows: opts.allows })).sort((a, b) => a.name.localeCompare(b.name)).map(async k => {
        const hint = typeof k.hint === "function" ? await Promise.resolve(k.hint(ctx, { allows: opts.allows })).catch(() => null) : k.hint;
        return { name: k.name, module: k.module, hint: hint ?? null };
    }));
}
