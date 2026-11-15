/**
 * Lists the chat input kinds that are loaded (secret, confirm, choice, grid, plugin kinds) with their spec hints.
 * Use before input.request to see which kinds exist and what spec each one takes.
 */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Internal capability predicate; scoped discovery omits kinds without required-function metadata. */
    allows?: (name: string) => boolean;
}): Array<{ name: string; module: string; hint: string | null }> {
    const kinds = ((ctx.state as any).input?.kinds ?? {}) as Record<string, types.input.Registered>;
    return Object.values(kinds).filter(k => ctx.fns.agentPreset.discoveryVisible({ requires: k.requires, allows: opts.allows })).sort((a, b) => a.name.localeCompare(b.name)).map(k => ({ name: k.name, module: k.module, hint: k.hint ?? null }));
}
