/** Accept a /trigger command as an ordinary human request, without changing planning or operating a trigger. */
export default async function (ctx: Context, _session: Session | null, opts: types.commands.ActionInput): Promise<types.commands.ActionResult> {
    return ctx.fns.commands.enqueue({...opts, content: opts.text.trim(), rejectActive: true});
}
