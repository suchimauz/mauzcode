/** List server-dispatchable slash commands using the legacy catalogue fields.
 * Use commands.catalogue version 2 for client actions, sections and availability reasons.
 * @param opts.agentId Existing agent to scope discovery; omit for new-session choices.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Existing agent to scope discovery; omit for new-session choices. */ agentId?: string;
}): Promise<{name:string;description:string;inputHint:string;attachments:boolean;usage:string[]}[]> {
    return (await ctx.fns.commands.catalogue({agentId: opts.agentId, version: 1})).commands;
}
