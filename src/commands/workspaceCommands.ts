import { constants } from 'node:fs';
import { lstat, open, opendir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

/** Load bounded Markdown declarations from the user's command directory and an agent's own local or SSH workspace. */
export default async function(ctx: Context, _session: Session | null, opts: {
    /** Workspace to inspect; omit for a new session to list only user commands. */
    agent?: Pick<types.agent.Agent, 'workspaceDir' | 'workspaceHost'>;
}): Promise<types.commands.Command[]> {
    const maxFiles = 50, maxBytes = 32 * 1024, ttl = 5000;
    const state: types.commands.State = ctx.state.commands ??= {};
    const cache = state.fileCache ??= new Map();
    const warn = (source: string, msg: string) => ctx.fns.procs.log.warn({ event: 'commands.file.skipped', source, msg });

    async function load(namespace: 'project' | 'user', dir: string, host = '') {
        const key = JSON.stringify([namespace, host, dir]);
        const previous = cache.get(key);
        if (previous && Date.now() - previous.checked < ttl) return previous.commands;
        const files: {name: string; size: number; mtime: string}[] = [];
        const source = (name: string) => (host ? `${host}:` : '') + join(dir, name);
        const overflow = (name: string) => warn(source(name), `Only ${maxFiles} command files per directory; skipping this and subsequent files`);
        const quote = (value: string) => ctx.fns.remote.quote({value});
        // Reject symlinked directories/files: a repository cannot publish a template from outside its workspace.
        const remoteDir = host ? `d=${quote(dir)}; [ ! -L "$d" ] && [ ! -L "\${d%/*}" ] && cd -- "$d" 2>/dev/null` : '';
        try {
            if (host) {
                // A single metadata roundtrip. NUL records allow arbitrary filenames, and the loop bounds the reply.
                const command = `${remoteDir} || exit 0; n=0; for f in *.md; do [ ! -L "$f" ] && [ -f "$f" ] || continue; n=$((n+1)); if [ "$n" -gt ${maxFiles} ]; then printf '%s\\0' "$f" limit; break; fi; m=$(stat -c '%s|%y' -- "$f" 2>/dev/null || stat -f '%z|%m' "./$f") || exit 1; printf '%s\\0%s\\0' "$f" "$m"; done`;
                const r = await ctx.fns.remote.exec({host, command, timeout: 8, maxOutput: 65536});
                if (r.exitCode !== 0) throw Error('Cannot inspect remote directory');
                const fields = r.stdout.split('\0');
                for (let i = 0; i + 1 < fields.length; i += 2) {
                    const name = fields[i]!, meta = fields[i + 1]!;
                    if (meta === 'limit') { overflow(name); break; }
                    const [size, mtime] = meta.split('|');
                    if (name !== basename(name) || !mtime || !/^\d+$/.test(size ?? '')) throw Error('Invalid remote metadata');
                    files.push({name, size: Number(size), mtime});
                }
            } else {
                if ((namespace !== 'project' || (await lstat(dirname(dir))).isDirectory()) && (await lstat(dir)).isDirectory()) {
                    for await (const entry of await opendir(dir)) {
                        if (!entry.isFile() || entry.name.startsWith('.') || !entry.name.endsWith('.md')) continue;
                        if (files.length === maxFiles) { overflow(entry.name); break; }
                        const stat = await lstat(join(dir, entry.name), {bigint:true});
                        if (stat.isFile()) files.push({name:entry.name, size:Number(stat.size), mtime:String(stat.mtimeNs)});
                    }
                }
            }
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') warn(source(''), 'Cannot inspect command directory');
            files.length = 0;
        }
        files.sort((a, b) => a.name.localeCompare(b.name));
        const fingerprint = JSON.stringify(files);
        if (previous && previous.fingerprint === fingerprint) { previous.checked = Date.now(); return previous.commands; }
        const commands: types.commands.Command[] = [];
        let allRead = true;
        for (const {name, size} of files) {
            const path = join(dir, name);
            if (size > maxBytes) { warn(source(name), `Command exceeds ${maxBytes} bytes`); continue; }
            let text: string;
            try {
                if (host) {
                    const command = `${remoteDir} || exit 1; f=${quote('./' + name)}; [ ! -L "$f" ] && [ -f "$f" ] && head -c ${maxBytes + 1} < "$f"`;
                    const r = await ctx.fns.remote.exec({host, command, maxOutput:maxBytes + 1, timeout:8});
                    if (r.exitCode !== 0) throw Error('Cannot read remote file');
                    text = r.stdout;
                    if (Buffer.byteLength(text) > maxBytes) throw Error('File grew beyond command size limit');
                } else {
                    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
                    try {
                        if (!(await file.stat()).isFile()) throw Error('Not a regular file');
                        const buf = Buffer.alloc(maxBytes + 1);
                        let bytes = 0;
                        while (bytes < buf.length) {
                            const {bytesRead} = await file.read(buf, bytes, buf.length - bytes);
                            if (!bytesRead) break;
                            bytes += bytesRead;
                        }
                        if (bytes > maxBytes) throw Error('File grew beyond command size limit');
                        text = buf.toString('utf8', 0, bytes);
                    } finally { await file.close(); }
                }
            } catch {
                allRead = false;
                warn(source(name), 'Cannot read command file within size limit');
                continue;
            }
            try {
                const declaration = await ctx.fns.commands.markdown({text});
                const command = await ctx.fns.commands.validateDeclaration({declaration, namespace, shortName:basename(name, '.md'), source:source(name), untrusted:namespace});
                commands.push(command);
            } catch (err) { warn(source(name), err instanceof Error ? err.message : 'Invalid command file'); }
        }
        if (!cache.has(key) && cache.size >= 256) cache.delete(cache.keys().next().value!);
        // Retry transient file-read failures on the next scan even if the metadata did not change.
        cache.set(key, {checked: Date.now(), fingerprint: allRead ? fingerprint : '', commands});
        return commands;
    }
    const user = ctx.env.USER_PLUGINS?.trim();
    const userDir = user && resolve(user.startsWith('./') || user.startsWith('../') ? ctx.fns.procs.project.projectRoot({}) : ctx.fns.procs.project.workdir({}), user.replace(/^~\//, homedir() + '/'), 'commands');
    const [personal, project] = await Promise.all([
        userDir ? load('user', userDir) : [],
        opts.agent?.workspaceDir ? load('project', join(opts.agent.workspaceDir, '.mauzcode/commands'), opts.agent.workspaceHost) : [],
    ]);
    return [...personal, ...project];
}
