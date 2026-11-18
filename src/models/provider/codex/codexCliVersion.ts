/**
 * Detect the local Codex CLI version with bounded execution and a shared cache.
 *
 * Best effort only: failures are cached for thirty seconds, successes for five minutes.
 * Never returns command output or inspects remote instances.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: { /** Discard a completed cached detection. */ refresh?: boolean },
): Promise<string | null> {
    const state = ((ctx.state as any).models ??= {});
    type Entry = { fingerprint: string; expires: number; value: string | null; pending?: Promise<string | null> };
    const cache: Map<string, Entry> = state.codexCliVersions ??= new Map();
    const home = ctx.env.HOME ?? process.env.HOME ?? "";
    const path = [`${home}/.local/bin`, "/opt/homebrew/bin", "/usr/local/bin", ctx.env.PATH ?? process.env.PATH ?? ""].filter(Boolean).join(":");
    const prior = cache.get("local");
    if (prior?.fingerprint === path) {
        if (prior.pending) return prior.pending;
        if (!opts.refresh && prior.expires > Date.now()) return prior.value;
    }
    const entry: Entry = { fingerprint: path, expires: 0, value: null };
    cache.set("local", entry);
    entry.pending = Promise.resolve().then(async () => {
        let version: string | null = null;
        try {
            const proc = Bun.spawn(["codex", "--version"], { stdin: "ignore", stdout: "pipe", stderr: "ignore", env: { ...process.env, ...ctx.env, PATH: path } });
            const reader = proc.stdout.getReader();
            let expired = false;
            const soft = setTimeout(() => { expired = true; proc.kill("SIGTERM"); }, 8_000);
            let hard: ReturnType<typeof setTimeout> | undefined;
            try {
                const output = await Promise.race([
                    (async () => {
                        const decoder = new TextDecoder();
                        let text = "";
                        let bytes = 0;
                        while (true) {
                            const chunk = await reader.read();
                            if (chunk.done) break;
                            bytes += chunk.value.byteLength;
                            if (bytes > 4096) throw new Error("CLI version output limit exceeded");
                            text += decoder.decode(chunk.value, { stream: true });
                        }
                        text += decoder.decode();
                        return await proc.exited === 0 && !expired ? text : "";
                    })(),
                    new Promise<string>(resolve => {
                        hard = setTimeout(() => { expired = true; proc.kill("SIGKILL"); resolve(""); }, 12_000);
                    }),
                ]);
                version = output.trim().match(/^codex(?:-cli)? (\d+\.\d+\.\d+)(?=\s|$)/)?.[1] ?? null;
                if (version && version.length > 40) version = null;
            } finally {
                clearTimeout(soft);
                clearTimeout(hard);
                proc.kill("SIGKILL");
                await reader.cancel().catch(() => undefined);
                await proc.exited;
            }
        } catch {
            // Detection failure must not prevent SDK requests.
        }
        entry.value = version;
        entry.expires = Date.now() + (version ? 300_000 : 30_000);
        entry.pending = undefined;
        return version;
    });
    return entry.pending;
}
