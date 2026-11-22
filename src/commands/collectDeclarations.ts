import { resolve } from 'node:path';

/** Reconcile one declaration family. A full collection replaces missing plugin files; a hot save replaces only its file. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Command, kind handler or menu section loader. */ family: 'command'|'commandKind'|'commandSection';
    /** Classified declaration files in mount order. */ entries: {abs:string; rel:string; moduleDir:string; name:string; removed?:boolean; mod?:{default?:unknown; sections?:unknown}; fn?:unknown; root?:string}[];
    /** Authoritative scan, including an empty result after unmounting a plugin. */ full?:boolean;
}): Promise<void> {
    const state = (ctx.state.commands ??= {});
    const sources = state.sources ??= new Map();
    const incoming = new Set(opts.entries.map(entry => entry.abs));
    if (opts.full) for (const [path, source] of sources) if (source.family === opts.family && !incoming.has(path)) sources.delete(path);
    const diagnostic = (rel:string, e:unknown) => console.warn(`[commands] ${rel}: ${e instanceof Error ? e.message : String(e)}`);
    for (const entry of opts.entries) {
        // Keep insertion order for updates: a losing duplicate must not take precedence on hot save.
        if (entry.removed) {sources.delete(entry.abs); continue;}
        try {
            let value:unknown, sections:unknown;
            if (entry.abs.endsWith('.ts')) {
                const mod = entry.mod ?? (entry.fn ? {default:entry.fn} : await import(entry.abs + `?t=${Bun.nanoseconds()}`));
                value = mod.default; sections = mod.sections;
            } else if (entry.abs.endsWith('.json') && opts.family !== 'commandKind') value = await Bun.file(entry.abs).json();
            else if (entry.abs.endsWith('.md') && opts.family === 'command') value = ctx.fns.commands.markdown({text:await Bun.file(entry.abs).text()});
            else throw new Error('unsupported declaration file extension');
            const namespace = entry.moduleDir.replaceAll('/','.');
            // A mounted plugin can place its file in a directory literally called "commands".
            if (value && typeof value === 'object' && 'builtin' in value && value.builtin &&
                entry.abs !== resolve(import.meta.dir, '..', entry.rel)) throw new Error('only core commands and planning may declare builtin');
            sources.set(entry.abs, {family:opts.family, rel:entry.rel, namespace, name:entry.name, value, sections});
        } catch (error) {sources.delete(entry.abs); diagnostic(entry.rel,error);}
    }
    const kinds: NonNullable<types.commands.State['kinds']> = Object.create(null);
    const sections: NonNullable<types.commands.State['sections']> = Object.create(null);
    const registry: NonNullable<types.commands.State['registry']> = Object.create(null);
    const word = /^[A-Za-z][\w-]*$/;
    const addSection = (id:string, value:unknown) => {
        const section = value as types.commands.Section;
        if (!word.test(id) || !section || typeof section.label !== 'string' || !section.label.trim() || section.order !== undefined && !Number.isFinite(section.order)) throw new Error('invalid menu section');
        if (sections[id]) throw new Error(`duplicate menu section ${id}`);
        sections[id] = {id,label:section.label,order:section.order ?? 100};
    };
    for (const source of sources.values()) {
        try {
            if (source.family === 'commandKind') {
                const handler = source.value as types.commands.KindHandler;
                if (!word.test(source.name) || !handler || typeof handler.validate !== 'function' || typeof handler.describe !== 'function' || handler.dispatch !== undefined && typeof handler.dispatch !== 'function') throw new Error('invalid kind handler');
                if (kinds[source.name]) throw new Error(`duplicate kind ${source.name}`);
                kinds[source.name] = handler;
            } else if (source.family === 'commandSection') addSection(source.name,source.value);
            else if (source.sections !== undefined) {
                if (!Array.isArray(source.sections)) throw new Error('sections must be an array');
                for (const section of source.sections) addSection(section?.id,section);
            }
        } catch (error) {diagnostic(source.rel,error);}
    }
    state.kinds = kinds;
    for (const source of sources.values()) {
        if (source.family !== 'command') continue;
        try {
            const command = await ctx.fns.commands.validateDeclaration({declaration:source.value,namespace:source.namespace,shortName:source.name,source:source.rel});
            if (Object.hasOwn(registry,command.name)) throw new Error(`duplicate command /${command.name}`);
            registry[command.name] = command;
        } catch (error) {diagnostic(source.rel,error);}
    }
    state.registry = registry;
    state.sections = sections;
    state.fileCache?.clear();
}
