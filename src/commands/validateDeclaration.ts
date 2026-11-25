/** Validate one declaration and return a normalized command without registering it. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Raw static metadata. */ declaration: unknown;
    /** Dotted name of the declaring module. */ namespace: string;
    /** Name from the file stem. */ shortName: string;
    /** File displayed in diagnostics. */ source: string;
    /** Enforce non-executable user or workspace data. */ untrusted?: 'project'|'user';
}): Promise<types.commands.Command & {name:string}> {
    const fail = (message: string): never => {throw new Error(`${opts.source}: ${message}`)};
    const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    const word = /^[A-Za-z][\w-]*$/;
    const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
    const raw = opts.declaration;
    if (!record(raw)) return fail('expected a declaration object');
    if (!word.test(opts.shortName) || !opts.namespace.split('.').every(s => word.test(s))) return fail('invalid command name or namespace');
    if (raw.name !== undefined && raw.name !== opts.shortName) return fail('name must match the file stem');
    if (opts.untrusted) {
        if (opts.namespace !== opts.untrusted || !(raw.kind === 'prompt' || opts.untrusted === 'user' && raw.kind === 'client')) return fail('command kind is not allowed');
        if (raw.kind !== 'client' && 'clientAction' in raw) return fail('a prompt cannot declare clientAction');
        for (const key of ['fn','available','builtin','completion','suggest']) if (key in raw) return fail(`field ${key} is not allowed`);
    } else if (['user', 'project'].includes(opts.namespace.split('.')[0]!)) return fail('reserved namespace');
    // skill. names are canonical Agent Skill IDs derived from packages; no declaration may claim one.
    if (opts.namespace.startsWith('skill.')) return fail('the skill. namespace is reserved for Agent Skills');
    if (raw.builtin && !['commands','planning'].includes(opts.namespace)) return fail('builtin is reserved for commands and planning');
    for (const key of ['kind','label','description']) if (!text(raw[key])) return fail(`${key} is required`);
    if (!word.test(String(raw.kind))) return fail('invalid kind');
    for (const key of ['builtin','requiresSession','blockWhileRunning','attachments']) if (raw[key] !== undefined && typeof raw[key] !== 'boolean') return fail(`invalid ${key}`);
    for (const key of ['section','available','fn','inputHint']) if (raw[key] !== undefined && !text(raw[key])) return fail(`invalid ${key}`);
    if (raw.order !== undefined && !Number.isFinite(raw.order)) return fail('invalid order');
    if (raw.usage !== undefined && !(Array.isArray(raw.usage) && raw.usage.every(text))) return fail('invalid usage');
    if (raw.args !== undefined) {
        if (!record(raw.args) || raw.args.placeholder !== undefined && !text(raw.args.placeholder)) return fail('invalid args');
        const options = raw.args.options;
        if (options !== undefined && !(Array.isArray(options) && options.length <= 100 && options.every(o => record(o) && text(o.value) && ['value','label','description'].every(key => o[key] === undefined || typeof o[key] === 'string' && o[key].length <= 200)))) return fail('invalid argument options (maximum 100, fields up to 200 characters)');
    }
    const name = raw.builtin ? opts.shortName : `${opts.namespace}:${opts.shortName}`;
    const command = {...raw, name, icon: raw.icon ?? 'wrench', section:raw.section ?? 'commands', order:raw.order ?? 100} as types.commands.Command & {name:string};
    if (!ctx.fns.ui.iconKeys({}).includes(command.icon!)) {
        console.warn(`${opts.source}: unknown command icon; using wrench`);
        command.icon = 'wrench';
    }
    const kinds = ctx.state.commands?.kinds;
    if (!kinds || !Object.hasOwn(kinds, command.kind)) return fail(`unknown command kind ${command.kind}`);
    await kinds[command.kind]!.validate(command, ctx);
    return command;
}
