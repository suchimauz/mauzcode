/** Runtime contract for a command action or a kind dispatcher. */
export type ActionHandler = (ctx: Context, session: Session | null, opts: types.commands.ActionInput) => Promise<types.commands.ActionResult>;
