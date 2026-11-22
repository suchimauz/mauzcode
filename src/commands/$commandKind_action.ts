/** Only explicitly typed command actions can be exposed through a declaration. */
function action(ctx: Context, name?: string): (opts: types.commands.ActionInput) => Promise<types.commands.ActionResult> {
    const path = name?.split('.') ?? [];
    let node: any = ctx.state.registry;
    if (path.length < 2 || !path.every(key => /^[A-Za-z][\w]*$/.test(key))) throw new Error('Expected a dotted action fn');
    for (const key of path) node = node && Object.hasOwn(node, key) ? node[key] : undefined;
    if (typeof node !== 'function' || node.meta?.optsType !== 'types.commands.ActionInput' || node.meta?.returnType !== 'Promise<types.commands.ActionResult>') {
        throw new Error(`${name} is not a registered command action handler`);
    }
    // Invoke through the normal runtime facade: tracing, hooks and session binding remain intact.
    return path.reduce<any>((bound, key) => bound[key], ctx.fns);
}
export default {
    validate(command, ctx) { action(ctx, command.fn); },
    describe() { return {}; },
    async dispatch(ctx, _session, opts) { return action(ctx, opts.command.fn)({...opts}); },
} satisfies types.commands.KindHandler;
