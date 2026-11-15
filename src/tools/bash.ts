// Run a shell snippet in the agent's workspace. Secret references are resolved
// into child-process environment variables and redacted from captured output.
/**
 * Runs a shell command in the agent workspace, or on a remote SSH host over a persistent connection.
 *
 * @param opts.host SSH host alias from ~/.ssh/config (see remote.servers), or "local"; omitted means the agent workspace (remote when workspace.set gave it a host).
 * @param opts.command Shell command to execute.
 * @param opts.cwd Working directory; relative to the workspace locally, remote path with host.
 * @param opts.env Additional environment variables.
 * @param opts.secrets Secret references exposed as environment variables; values are redacted from output.
 * @param opts.timeout Timeout in seconds; on a local call it also bounds optional RTK preparation.
 * @param opts.rtk Pass false to skip automatic RTK output compression for this local call; omitted follows the instance setting.
 *
 * Local calls (no host, or host "local", in a local workspace) may be prepared by the optional official RTK plugin
 * when its owner enabled it: the command can be replaced by its `rtk …` equivalent and run once. SSH targets are never
 * touched. The result then carries `details.rtk` with the original and executed command (secrets masked).
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** SSH host alias from ~/.ssh/config (see remote.servers), or "local"; omitted means the agent workspace (remote when workspace.set gave it a host). */
        host?: string;
        /** Shell command to execute. */
        command: string;
        /** Working directory relative to the workspace. */
        cwd?: string;
        /** Additional environment variables. */
        env?: Record<string, string>;
        /** Secret references (op://, env:// or secret://namespace/name) exposed as environment variables; values are redacted from output. */
        secrets?: Record<string, string>;
        /** Timeout in seconds; on a local call it also bounds optional RTK preparation. */
        timeout?: number;
        /** Pass false to skip automatic RTK output compression for this local call; omitted follows the instance setting. It never enables RTK. */
        rtk?: boolean;
    },
): Promise<{ output: string; isError: boolean; details?: { rtk: RtkDetails } }> {
    const secretEnv: Record<string, string> = {};
    const sensitive: string[] = [];

    for (const [name, ref] of Object.entries(opts.secrets ?? {})) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`invalid secret environment variable: ${name}`);
        if (!ref.startsWith("op://") && !ref.startsWith("env://") && !ref.startsWith("secret://")) {
            throw new Error(`secret ${name} must be an op://, env:// or secret:// reference`);
        }
        const value = await ctx.fns.secrets.get({ ref });
        if (!value) throw new Error(`secret ${name} could not be resolved`);
        secretEnv[name] = value;
        sensitive.push(value);
    }

    // Longer values first avoids partial masking when one secret prefixes another.
    const ordered = [...new Set(sensitive)].sort((a, b) => b.length - a.length);
    const redact = (text: string) => ordered.reduce((acc, value) => acc.replaceAll(value, "[REDACTED]"), text);

    const at = ctx.fns.workspace.target({ host: opts.host, path: opts.cwd });
    if (at.host) {
        const result = await remote(ctx, at.host, opts.command, at.path, { ...opts.env, ...secretEnv }, opts.timeout);
        result.output = redact(result.output);
        return result;
    }

    const startedAt = Date.now();
    const seconds = Number(opts.timeout);
    const timed = Number.isFinite(seconds) && seconds > 0;
    const prepared = opts.rtk === false ? null : await prepareRtk(ctx, opts.command, at.path, { ...opts.env, ...secretEnv }, timed ? startedAt + seconds * 1000 : undefined);
    const details = prepared && (prepared.outcome !== "inactive" || prepared.notice)
        ? { rtk: {
            outcome: prepared.outcome,
            original: redact(prepared.original),
            executed: prepared.action === "execute" ? redact(prepared.command) : null,
            code: prepared.code,
            notice: prepared.notice === null ? null : redact(prepared.notice),
            diagnostic: prepared.diagnostic === null ? null : redact(prepared.diagnostic),
        } }
        : undefined;
    const withDetails = (r: { output: string; isError: boolean }) => details ? { ...r, details } : r;

    if (prepared?.action === "deny") {
        const why = details?.rtk.diagnostic ? `\n${details.rtk.diagnostic}` : "";
        return withDetails({ output: `[rtk: denied by RTK rules (rewrite exit 2) — the command was not executed]${why}`, isError: true });
    }
    if (prepared?.action === "timeout") {
        return withDetails({ output: `[timed out after ${seconds}s — the deadline passed while RTK prepared the command; it was not started]`, isError: true });
    }

    // A user stop that arrived while RTK was preparing must not start the command at all.
    if (prepared && (ctx as any).toolRun?.controller?.signal?.aborted) {
        return withDetails({ output: "[stopped by the user before the command started — nothing was executed]", isError: true });
    }

    // The one and only execution. A failure after this point is a result, never a reason to run anything again.
    const remaining = timed && prepared ? Math.max(0.001, (startedAt + seconds * 1000 - Date.now()) / 1000) : opts.timeout;
    const result = await ctx.fns.agent.executeBash({
        code: prepared?.command ?? opts.command,
        cwd: opts.cwd,
        env: { ...opts.env, ...secretEnv },
        timeout: remaining,
    });
    // Report the caller's declared timeout even though execution got only the share left after preparation.
    if (timed && remaining !== opts.timeout) result.output = result.output.replace(`[timed out after ${remaining}s`, `[timed out after ${seconds}s`);
    result.output = redact(result.output);
    if (details?.rtk.notice) result.output = `${details.rtk.notice}\n${result.output}`;
    return withDetails(result);
}

/** Safe record of what RTK did to a local bash call; every string has resolved secrets masked. */
type RtkDetails = {
    /** Preparation outcome, see rtk.prepare. */
    outcome: string;
    /** Command as the caller wrote it. */
    original: string;
    /** Command actually executed; null when nothing ran (denied or deadline). */
    executed: string | null;
    /** Exit code of `rtk rewrite`, when it finished normally. */
    code: number | null;
    /** Notice prepended to the result, e.g. a technical disablement. */
    notice: string | null;
    /** RTK denial message (exit 2) or why RTK was skipped for this call. */
    diagnostic: string | null;
};

// Optional seam: the official RTK plugin may be absent or unloaded, then bash behaves exactly as without it.
// A failure inside preparation happens before the command starts, so running the original once is still safe.
async function prepareRtk(ctx: Context, command: string, cwd: string, extra: Record<string, string>, deadline?: number): Promise<types.rtk.Preparation | null> {
    const prepare = (ctx.fns as any).rtk?.prepare;
    if (typeof prepare !== "function") return null;
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") env[k] = v;
    Object.assign(env, extra);
    try {
        return await prepare({ command, cwd, env, ...(deadline === undefined ? {} : { deadline }) }) as types.rtk.Preparation;
    } catch {
        return { action: "execute", command, original: command, outcome: "fallback", code: null, notice: "[rtk: preparation failed unexpectedly; the original command ran unchanged]", diagnostic: null, path: null };
    }
}

// Remote branch: same output contract as agent.executeBash, transported by remote.exec.
// Output is capped (head + tail kept) so one noisy remote command cannot flood the transcript.
const REMOTE_MAX = 100_000;
function cap(text: string): string {
    if (text.length <= REMOTE_MAX) return text;
    const half = REMOTE_MAX / 2;
    return `${text.slice(0, half)}\n… [${text.length - REMOTE_MAX} chars cut — redirect to a file and read/grep it] …\n${text.slice(-half)}`;
}
async function remote(ctx: Context, host: string, command: string, cwd: string | undefined, env: Record<string, string>, timeout?: number): Promise<{ output: string; isError: boolean }> {
    const shq = (s: string) => ctx.fns.remote.quote({ value: s });
    const exports = Object.entries(env).map(([k, v]) => `export ${k}=${shq(v)}\n`).join("");
    const limit = timeout ?? 600;
    const r = await ctx.fns.remote.exec({ host, command: exports + command, cwd, timeout: limit });
    if (r.timedOut) return { output: cap(`[timed out after ${limit}s]\n${r.stdout}${r.stderr}`), isError: true };
    if (r.exitCode === 255 && !r.stdout) return { output: `[ssh ${host} failed]\n${r.stderr.trim()}\nCheck the host with ctx.fns.remote.status({ host: "${host}" }).`, isError: true };
    if (r.exitCode !== 0) return { output: cap(`[exit ${r.exitCode}]\n${r.stderr}\nstdout:\n${r.stdout}`), isError: true };
    return { output: cap(r.stdout || (r.stderr ? "(stderr)\n" + r.stderr : "(no output)")), isError: false };
}
