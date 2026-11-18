/** Detect Claude CLI identity with source-preserving, destination-scoped caching. */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: { instance?: string; refresh?: boolean },
): Promise<{ value: string; detected: boolean }> {
    const fallback = { value: "2.1.260", detected: false };
    const state = ((ctx.state as any).models ??= {});
    type Result = { value: string; detected: boolean };
    type Entry = { fingerprint: string; expires: number; result?: Result; pending?: Promise<Result> };
    const cache: Map<string, Entry> = state.claudeCliVersions ??= new Map();
    const key = opts.instance === undefined ? "local" : `ssh:${opts.instance}`;
    const home = ctx.env.HOME ?? process.env.HOME ?? "";
    const path = [`${home}/.local/bin`, "/opt/homebrew/bin", "/usr/local/bin", ctx.env.PATH ?? process.env.PATH ?? ""].filter(Boolean).join(":");
    let fingerprint: string;
    try {
        fingerprint = opts.instance === undefined ? path : JSON.stringify(await ctx.fns.sshInstance.get({ name: opts.instance }));
    } catch {
        return fallback;
    }
    if (opts.refresh) cache.delete(key);
    const prior = cache.get(key);
    if (prior?.fingerprint === fingerprint) {
        if (prior.pending) return prior.pending;
        if (prior.expires > Date.now() && prior.result) return prior.result;
    }
    const entry: Entry = { fingerprint, expires: 0 };
    cache.set(key, entry);
    entry.pending = (async () => {
        let version: string | undefined;
        try {
            const connection = opts.instance === undefined ? undefined : await ctx.fns.sshInstance.connection({ name: opts.instance });
            const command = 'export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; exec timeout -k 1s 8s claude --version';
            const argv = connection ? [connection.bin, ...connection.args, connection.host, command] : ["claude", "--version"];
            const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "ignore", env: { ...process.env, ...ctx.env, PATH: path } });
            let expired = false;
            const timer = setTimeout(() => { expired = true; proc.kill("SIGKILL"); }, 12_000);
            const reader = proc.stdout.getReader();
            try {
                let output = "";
                let bytes = 0;
                const decoder = new TextDecoder();
                while (true) {
                    const chunk = await reader.read();
                    if (chunk.done) break;
                    bytes += chunk.value.byteLength;
                    if (bytes > 4096) throw new Error("CLI version output limit exceeded");
                    output += decoder.decode(chunk.value, { stream: true });
                }
                output += decoder.decode();
                if (await proc.exited === 0 && !expired) version = output.trim().match(/^(\d+\.\d+\.\d+)(?:\s+\(Claude Code\))?$/)?.[1];
                if (version && version.length > 40) version = undefined;
            } finally {
                clearTimeout(timer);
                proc.kill("SIGKILL");
                await reader.cancel().catch(() => undefined);
                await proc.exited;
            }
        } catch {
            // Never include command output or SSH details in the public report.
            version = undefined;
        }
        entry.result = { value: version ?? fallback.value, detected: version !== undefined };
        entry.expires = Date.now() + (version ? 300_000 : 30_000);
        entry.pending = undefined;
        return entry.result;
    })();
    return entry.pending;
}
