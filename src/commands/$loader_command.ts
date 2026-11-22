// Receive an empty scan when the last mounted declaration disappears.
export const collectEmpty = true;

/** Collect the command declarations from boot, reload, or a single hot save. */
export default async function (ctx: Context, _session: Session | null, opts: {entries:any[]; full?:boolean}): Promise<void> {
    await ctx.fns.commands.collectDeclarations({family:'command', entries:opts.entries, full:opts.full});
}
