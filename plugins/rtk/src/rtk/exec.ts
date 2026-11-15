/**
 * Runs one RTK executable invocation as a direct argv subprocess with a hard deadline and an output cap.
 *
 * Use for RTK health and rewrite probes only, never for user commands: no shell is involved, stdin is closed, and the
 * process is killed and reaped when it exceeds `timeoutMs` or `maxBytes` of combined stdout+stderr. Overflowed output is
 * reported with `overflow: true` and must never be executed or trusted. Never throws for process failures; spawn errors
 * come back in `error`.
 * @param opts.argv Executable path followed by its arguments, e.g. ["/usr/bin/rtk", "--version"].
 * @param opts.env Complete child environment; the server environment when omitted.
 * @param opts.cwd Working directory of the child; the server cwd when omitted.
 * @param opts.timeoutMs Hard deadline in milliseconds.
 * @param opts.maxBytes Combined stdout+stderr cap in bytes.
 */
export default async function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Executable path followed by its arguments, e.g. ["/usr/bin/rtk", "--version"]. */
        argv: string[];
        /** Complete child environment; the server environment when omitted. */
        env?: Record<string, string>;
        /** Working directory of the child; the server cwd when omitted. */
        cwd?: string;
        /** Hard deadline in milliseconds. @default 5000 @minimum 1 @maximum 60000 */
        timeoutMs?: number;
        /** Combined stdout+stderr cap in bytes. @default 65536 @minimum 1 @maximum 1048576 */
        maxBytes?: number;
    },
): Promise<{ exitCode: number | null; signal: string | null; stdout: string; stderr: string; timedOut: boolean; overflow: boolean; error: string | null; errorCode: string | null }> {
    const timeoutMs = Math.min(Math.max(1, Math.floor(opts.timeoutMs ?? 5000)), 60_000);
    const maxBytes = Math.min(Math.max(1, Math.floor(opts.maxBytes ?? 65_536)), 1_048_576);
    if (!Array.isArray(opts.argv) || !opts.argv.length || opts.argv.some(a => typeof a !== 'string' || a.includes('\0'))) {
        return { exitCode: null, signal: null, stdout: '', stderr: '', timedOut: false, overflow: false, error: 'invalid argv', errorCode: 'EINVAL' };
    }
    let proc: ReturnType<typeof Bun.spawn>;
    try {
        proc = Bun.spawn(opts.argv, { env: opts.env ?? (process.env as Record<string, string>), cwd: opts.cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    } catch (e) {
        const err = e as { code?: string; message?: string };
        return { exitCode: null, signal: null, stdout: '', stderr: '', timedOut: false, overflow: false, error: String(err?.message ?? e).slice(0, 300), errorCode: typeof err?.code === 'string' ? err.code : null };
    }
    let total = 0, overflow = false, timedOut = false;
    const readers: Array<{ cancel(): Promise<void> }> = [];
    // Killing the direct child does not close pipes inherited by its descendants; cancel reads so we never wait on them.
    const kill = () => { try { proc.kill('SIGKILL'); } catch { /* already exited */ } for (const r of readers) r.cancel().catch(() => undefined); };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const drain = async (stream: ReadableStream<Uint8Array>) => {
        const chunks: Uint8Array[] = [];
        const reader = stream.getReader(); readers.push(reader);
        if (timedOut || overflow) { reader.cancel().catch(() => undefined); return ''; }
        while (true) {
            const { done, value } = await reader.read().catch(() => ({ done: true as const, value: undefined }));
            if (done || !value) break;
            if (overflow || timedOut) continue;
            total += value.byteLength;
            if (total > maxBytes) { overflow = true; kill(); break; }
            chunks.push(value);
        }
        return Buffer.concat(chunks).toString('utf8');
    };
    try {
        const [stdout, stderr] = await Promise.all([drain(proc.stdout as ReadableStream<Uint8Array>), drain(proc.stderr as ReadableStream<Uint8Array>)]);
        await proc.exited;
        return { exitCode: timedOut || overflow ? null : proc.exitCode, signal: proc.signalCode ?? null, stdout, stderr, timedOut, overflow, error: null, errorCode: null };
    } finally {
        clearTimeout(timer);
    }
}
