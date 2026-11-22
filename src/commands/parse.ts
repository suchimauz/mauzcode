/** Recognize registered slash commands; ordinary prose, dotted file names and absolute paths return null. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Composer text to inspect. */ text:string;
    /** Optional pre-resolved catalogue for this request. */ names?:string[];
    /** Resolve project and user commands in this agent's own workspace. */ agentId?:string;
}): Promise<null|{name:string;args:string}> {
    const match = /^\/([a-zA-Z][\w-]*(?:(?:\.[a-zA-Z][\w-]*)*:[a-zA-Z][\w-]*)?)(?:\s+([\s\S]*))?$/.exec(opts.text.trim());
    if (!match) return null;
    const name = match[1]!;
    let known = opts.names ? opts.names.includes(name) : Object.hasOwn(ctx.state.commands?.registry ?? {}, name);
    if (!opts.names && !known && /^(user|project):/.test(name)) {
        const agent = opts.agentId ? ctx.state.agent?.[opts.agentId] ?? await ctx.fns.session.load({id:opts.agentId}) : undefined;
        known = (await ctx.fns.commands.workspaceCommands({agent})).some(command => command.name === name);
    }
    if (!known) throw Object.assign(new Error(`Unknown command /${name}`),{status:400, code:'unknown_command'});
    return {name,args:match[2] ?? ''};
}
