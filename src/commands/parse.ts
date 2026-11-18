/**
 * Parse a registered slash command without executing it
 *
 * Returns a discriminated result: plan/compact carry mode/task; trigger carries its exact arguments as data. Returns null for ordinary text and absolute paths; command-shaped unknown names are rejected explicitly instead of sent to the model.
 * @param opts.text Composer text to inspect.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Composer text to inspect. */
        text: string;
    },
): Promise<null|{name:'plan'|'compact';mode:'plan'|'execute';task:string}|{name:'trigger';args:string}> {
    const match=opts.text.trim().match(/^\/([a-zA-Z][\w-]*)(?:\s+([\s\S]*))?$/);
    if(!match) return null;
    const known=await ctx.fns.commands.list({});
    if(!known.some(command=>command.name===match[1])) throw Object.assign(new Error('Unknown command /'+match[1]),{status:400,code:'unknown_command'});
    const arg=(match[2]??'').trim();
    // /trigger is a human request for the agent: its arguments stay data and never toggle planning.
    if(match[1]==='trigger') return {name:'trigger',args:arg};
    return {name:match[1] as 'plan'|'compact',mode:arg==='off'?'execute':'plan',task:arg==='off'?'':arg};
}
