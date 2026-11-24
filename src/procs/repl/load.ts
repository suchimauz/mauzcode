// Hot-reload functions from disk into the running process.
//   ctx.fns.procs.repl.load({ name: "project.scan" })  → reload one fn
//   ctx.fns.procs.repl.load({ name: "project" })       → reload whole module
//   ctx.fns.procs.repl.load({ name: "genTypes" })      → reload a root $name.ts fn
import { bindSelf, collectStateFile, isLoaded, setPath, source } from "../boot/load";
// mauzcode: recheck at the import boundary, independently of the scan's snapshot.
import skillData from "../project/skillData";

/**
 * Load the repl subsystem operation.
 * @param opts.name The target name.
 */
export default async function (ctx: Context, _session: Session | null, opts: { name: string }) {
    const target = opts.name;

    const entries = await ctx.fns.procs.project.scan({});

    if (target.includes('.')) {
        const segs = target.split('.');
        const fnName = segs.pop()!;
        const modPath = segs.join('/');
        await loadFile(ctx, modPath, fnName, entries);
        scheduleDocsIndex(ctx);
        return { reloaded: target };
    }

    const loaded: string[] = [];
    const others: string[] = [];
    for (const entry of entries) {
        if (entry.moduleDir !== target) continue;
        if (entry.kind !== 'fn') {
            // The module's declarative kinds ($canvas_, $fence_, $hook_, …) reload with it, through the
            // same loader table boot uses — otherwise a new canvas kind needed a restart. Only kinds whose
            // loader just (re)sets a keyed entry; routes have http.loadRoutes, crons and plugins own
            // schedules and mounts and keep their explicit reloads.
            if (!HOT_KINDS.has(entry.kind) || !isLoaded(ctx, entry.kind)) continue;
            if (skillData(ctx, null, { path: entry.abs }).blocked) continue;
            await collectStateFile(ctx, entry, entry.abs);
            others.push((entry as any).rel);
            continue;
        }
        await loadFile(ctx, target, entry.runtimeName!, entries);
        if (!loaded.includes(entry.runtimeName!)) loaded.push(entry.runtimeName!);
    }
    scheduleDocsIndex(ctx);
    return { reloaded: target, count: loaded.length, fns: loaded, ...(others.length ? { files: others } : {}) };
}

// mauzcode: provider declarations reload with their owning namespace, like other keyed registries.
const HOT_KINDS = new Set(['canvas', 'fence', 'input', 'hook', 'point', 'tool', 'setting', 'compaction', 'app', 'modelProvider', 'voiceProvider', 'prompt', 'command', 'commandKind', 'commandSection']);

function scheduleDocsIndex(ctx: Context): void {
    if (!(ctx.fns as any).runtime?.docs?.index) return;
    queueMicrotask(() => (ctx.fns as any).runtime.docs.index({}).catch((error: any) =>
        ctx.fns.procs.log.warn({ event: "runtime.docs.index.failed", msg: String(error?.message ?? error) })));
}


async function loadFile(ctx: Context, modPath: string, fnName: string, entries: Awaited<ReturnType<Context['fns']['procs']['project']['scan']>>) {
    // Reuse the caller's scan for the whole namespace; recheck the selected
    // path just before import in case its target has changed since that scan.
    const e = entries.find(x => x.kind === 'fn' && x.moduleDir === modPath && x.runtimeName === fnName);
    if (!e || skillData(ctx, null, { path: e.abs }).blocked) throw new Error(`no file for ${modPath}/${fnName}`);
    const m = await import((e as any).abs + `?t=${Date.now()}`);
    const fn = m.default;
    if (typeof fn !== 'function') throw new Error(`${(e as any).rel}: no default function export`);
    // Raw fns live in ctx.state.registry (ctx.fns is the injecting Proxy), and a
    // module's fn keeps seeing itself as `app` after a reload too.
    // Through the fn loader, so a hot-swapped function carries the same
    // metadata (name, module, file, docstring) a booted one does.
    const load = (ctx.state as any).procs?.boot?.loaders?.fn;
    if (load) await load(ctx, null, { entries: [{ ...(e as any), fn }] });
    else {
        setPath(ctx.state.registry, [...modPath.split('/'), fnName], bindSelf(fn, (e as any).namespace));
        const boot = ctx.state.procs.boot as any;
        const sources = (boot.namespaceSources ??= {});
        const provenance = (sources[modPath.split('/')[0]!] ??= { core: false, project: false });
        provenance[/(?:^|\/)\.mauzcode(?:\/|$)/.test(e.rootDir ?? e.abs) ? 'project' : 'core'] = true;
        boot.registryGeneration = (boot.registryGeneration ?? 0) + 1;
    }
    ctx.fns.procs.log.info({ event: "reload.fn", msg: `${modPath.replaceAll('/', '.')}.${fnName}`, from: source(e as any) });
}
