/**
 * Checks whether RTK on a given PATH is executable and speaks the supported rewrite protocol, within one bounded budget.
 *
 * Use for the owner's Check RTK action, before enabling, and to revalidate a restored enabled state. Resolves `rtk` on
 * the PATH, runs `rtk --version`, then `rtk rewrite "git status"` as a fixed read-only probe. The returned rewrite is
 * only inspected, never executed, and no shell is involved. Healthy means exit 0 or 3 with a nonempty single-line
 * rewrite containing `rtk`. Missing, non-executable, signal-killed (e.g. SIGILL on an unsupported CPU), timed-out,
 * oversized or protocol-incompatible executables, and a policy that refuses the probe, all return ok:false with a safe
 * reason. Never installs, updates or reconfigures anything.
 * @param opts.env Effective child environment, including PATH; the server environment when omitted.
 * @param opts.cwd Working directory for the probe processes; the server cwd when omitted.
 * @param opts.timeoutMs Total budget for both subprocesses in milliseconds.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Effective child environment, including PATH; the server environment when omitted. */
        env?: Record<string, string>;
        /** Working directory for the probe processes; the server cwd when omitted. */
        cwd?: string;
        /** Total budget for both subprocesses in milliseconds. @default 5000 @minimum 1 @maximum 60000 */
        timeoutMs?: number;
    } = {},
): Promise<types.rtk.ProbeResult> {
    const env = opts.env ?? (process.env as Record<string, string>);
    const deadline = Date.now() + Math.min(Math.max(1, opts.timeoutMs ?? 5000), 60_000);
    const fail = (code: types.rtk.ProbeResult['code'], reason: string, path: string | null = null, version: string | null = null): types.rtk.ProbeResult => ({ ok: false, path, version, code, reason });
    const found = await ctx.fns.rtk.resolve({ path: env.PATH ?? '', cwd: opts.cwd });
    if (!found.path) return found.problem === 'permission' ? fail('permission', 'A file named rtk on PATH is not executable (permission denied).') : fail('missing', 'RTK was not found on the server PATH.');
    const path = found.path;
    const technical = (r: Awaited<ReturnType<typeof ctx.fns.rtk.exec>>, step: string): types.rtk.ProbeResult | null => {
        if (r.error) return fail(r.errorCode === 'EACCES' ? 'permission' : 'spawn', `RTK could not be started for ${step}: ${r.errorCode ?? 'spawn error'}.`, path);
        if (r.timedOut) return fail('timeout', `RTK ${step} did not finish in time.`, path);
        if (r.overflow) return fail('overflow', `RTK ${step} produced too much output.`, path);
        if (r.signal) return fail('signal', `RTK ${step} was killed by ${r.signal}${r.signal === 'SIGILL' ? ' (illegal instruction: the binary is not built for this CPU)' : ''}.`, path);
        return null;
    };
    const left = () => Math.max(1, deadline - Date.now());
    const v = await ctx.fns.rtk.exec({ argv: [path, '--version'], env, cwd: opts.cwd, timeoutMs: left(), maxBytes: 4096 });
    const bad = technical(v, '--version'); if (bad) return bad;
    const match = /^rtk\s+v?(\d+\.\d+\.\d+[\w.+-]*)\s*$/m.exec(v.stdout);
    if (v.exitCode !== 0 || !match) return fail('incompatible', `RTK --version did not report a recognizable version (exit ${v.exitCode}).`, path);
    const version = match[1];
    if (Date.now() >= deadline) return fail('timeout', 'RTK check ran out of time before the rewrite probe.', path, version);
    const r = await ctx.fns.rtk.exec({ argv: [path, 'rewrite', 'git status'], env, cwd: opts.cwd, timeoutMs: left(), maxBytes: 4096 });
    const bad2 = technical(r, 'rewrite'); if (bad2) return { ...bad2, version };
    const out = r.stdout.trim();
    if ((r.exitCode === 0 || r.exitCode === 3) && out && !out.includes('\n') && /\brtk\b/.test(out)) return { ok: true, path, version, code: 'ok', reason: null };
    if (r.exitCode === 1 || r.exitCode === 2) return fail('policy', `RTK did not rewrite the read-only probe "git status" (exit ${r.exitCode}); rewrite capability could not be demonstrated with the current RTK configuration or permission rules.`, path, version);
    return fail('incompatible', `RTK rewrite returned an unsupported response (exit ${r.exitCode}).`, path, version);
}
