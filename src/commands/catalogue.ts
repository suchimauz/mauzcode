/** Build a versioned, public composer catalogue without exposing templates or handler names.
 * @param opts.agentId Existing agent whose workspace, preset and queue state determine availability.
 * @param opts.version Version 1 omits client-only commands; version 2 adds presentation and availability.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Existing agent; omit to list new-session choices. */ agentId?: string;
    /** Requested catalogue wire format. */ version: 1 | 2;
}) {
    const visible = await ctx.fns.commands.candidates({agentId: opts.agentId});
    const sectionMap = ctx.state.commands.sections ?? {};
    const sectionOrder = (command: types.commands.Command) => sectionMap[command.section ?? 'commands']?.order ?? 100;
    const sorted = visible.sort((a, b) => sectionOrder(a.command) - sectionOrder(b.command)
        || (a.command.order ?? 100) - (b.command.order ?? 100) || a.command.name!.localeCompare(b.command.name!));
    const legacy = (command: types.commands.Command) => ({name: command.name!, description: command.description,
        inputHint: command.inputHint ?? '/' + command.name, attachments: command.attachments ?? false, usage: command.usage ?? ['/' + command.name]});
    if (opts.version === 1) return {version: 1 as const, commands: sorted.filter(({command}) => command.kind !== 'client').map(({command}) => legacy(command))};
    const sections = Object.values(sectionMap).map(s => ({id: s.id, label: s.label, order: s.order ?? 100}))
        .sort((a,b) => a.order - b.order || a.id.localeCompare(b.id));
    const commands = sorted.map(({command, enabled, reason}) => ({
        ...ctx.state.commands.kinds?.[command.kind]?.describe(command, ctx),
        ...legacy(command), kind: command.kind, label: command.label, icon: command.icon ?? 'wrench',
        section: command.section ?? 'commands', order: command.order ?? 100, args: command.args, enabled, reason,
    }));
    return {version: 2 as const, sections, commands};
}
