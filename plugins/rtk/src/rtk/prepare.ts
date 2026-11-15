/**
 * Prepares one local bash tool command with RTK and decides, before anything runs, what may be executed.
 *
 * Use only from the local branch of tools.bash, never for SSH targets, terminals or internal subprocesses. Consults
 * RTK only while it is enabled and verified in this process lifecycle (rtk.revalidate probes once after restart or
 * change). Resolves `rtk` on the call's effective PATH; when that is not the checked executable the call is left
 * unchanged instead of silently switching binaries. Runs `rtk rewrite <command>` as one argv argument (no shell, the
 * user command is never executed here) in the effective cwd/environment, bounded by 5 s, 64 KiB and the caller
 * deadline, and never sets RTK_REWRITE_HOST or edits permission files.
 *
 * Outcomes: exit 0/3 with a valid nonempty replacement → execute it (code 3 adds no confirmation: the host's own
 * authorization applies); exit 1 with no output → execute the original; exit 2 → deny, execute nothing; spawn error,
 * signal, internal timeout, overflow, unknown code or invalid response → disable RTK instance-wide with a safe reason
 * and execute the original once; caller deadline exhausted → timeout, execute nothing. Never throws for RTK failures.
 * @param opts.command Complete original shell command, passed to RTK as one argument.
 * @param opts.cwd Effective absolute working directory the command will run in.
 * @param opts.env Effective complete child environment (server env, call env and resolved secrets).
 * @param opts.deadline Epoch milliseconds when the caller's whole bash timeout expires; omitted means no caller deadline.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Complete original shell command, passed to RTK as one argument. */
        command: string;
        /** Effective absolute working directory the command will run in. */
        cwd: string;
        /** Effective complete child environment (server env, call env and resolved secrets). */
        env: Record<string, string>;
        /** Epoch milliseconds when the caller's whole bash timeout expires; omitted means no caller deadline. */
        deadline?: number;
    },
): Promise<types.rtk.Preparation> {
    const LIMIT_MS = 5000;
    const MAX_BYTES = 65_536;
    const started = Date.now();
    const original = opts.command;
    const internalEnd = started + LIMIT_MS;
    const callerEnd = opts.deadline ?? Number.POSITIVE_INFINITY;
    const base = { command: original, original, code: null, notice: null, diagnostic: null, path: null } as const;
    const out = (p: Partial<types.rtk.Preparation> & Pick<types.rtk.Preparation, 'action' | 'outcome'>): types.rtk.Preparation => ({ ...base, ...p });
    const expired = () => Date.now() >= callerEnd;
    const deadline = (path: string | null = null) => out({ action: 'timeout', outcome: 'deadline', path });

    const state = (ctx.state.rtk ??= {});
    const generation = state.generation ?? 0;
    const current = await ctx.fns.rtk.status({});
    if (!current.enabled) return out({ action: 'execute', outcome: 'inactive' });
    if (expired()) return deadline();

    const ready = await ctx.fns.rtk.revalidate({ timeoutMs: Math.max(1, Math.min(internalEnd, callerEnd) - Date.now()) });
    if (ready.expired || expired()) return deadline();
    if (!ready.ready) {
        // A failed revalidation already disabled RTK and recorded its reason.
        const notice = ready.probed && !ready.control.enabled ? `[rtk: disabled automatically — ${ready.control.reason ?? 'availability check failed'}; the original command ran]` : null;
        return out({ action: 'execute', outcome: ready.probed ? 'fallback' : 'inactive', notice });
    }
    const checked = ready.control.path;

    const found = await ctx.fns.rtk.resolve({ path: opts.env.PATH ?? '', cwd: opts.cwd });
    if (!found.path || found.path !== checked) {
        return out({ action: 'execute', outcome: 'inactive', notice: `[rtk: not applied — this call's PATH ${found.path ? 'resolves a different rtk executable' : 'does not contain the checked rtk executable'}; the original command ran]` });
    }
    const path = found.path;

    const technical = async (reason: string): Promise<types.rtk.Preparation> => {
        await ctx.fns.rtk.disable({ reason: `${reason} RTK was disabled automatically; re-enable it in Settings after a successful check.` });
        if (expired()) return deadline(path);
        return out({ action: 'execute', outcome: 'fallback', path, notice: `[rtk: disabled automatically — ${reason} The original command ran unchanged.]` });
    };

    const budget = Math.min(internalEnd, callerEnd) - Date.now();
    if (budget <= 0) return expired() ? deadline(path) : technical('RTK preparation exceeded its time limit.');
    const r = await ctx.fns.rtk.exec({ argv: [path, 'rewrite', original], env: opts.env, cwd: opts.cwd, timeoutMs: Math.max(1, Math.floor(budget)), maxBytes: MAX_BYTES });

    // The caller's deadline wins over every other outcome: no user command may start after it.
    if (r.timedOut && callerEnd <= internalEnd) return deadline(path);
    if (r.error) return technical(`RTK rewrite could not be started (${r.errorCode ?? 'spawn error'}).`);
    if (r.timedOut) return technical('RTK rewrite did not finish within 5 s.');
    if (r.overflow) return technical('RTK rewrite produced more than 64 KiB of output.');
    if (r.signal) return technical(`RTK rewrite was killed by ${r.signal}${r.signal === 'SIGILL' ? ' (illegal instruction)' : ''}.`);
    if (expired()) return deadline(path);

    // Disable or plugin reload while RTK was thinking: the caller re-checks eligibility before launch.
    const after = await ctx.fns.rtk.status({});
    if (!after.enabled || (state.generation ?? 0) !== generation) return out({ action: 'execute', outcome: 'stale', path, code: r.exitCode });

    const code = r.exitCode;
    const text = r.stdout.endsWith('\n') ? r.stdout.slice(0, -1) : r.stdout;
    if (code === 0 || code === 3) {
        if (!text.trim()) return technical(`RTK rewrite returned exit ${code} without a command.`);
        if (text.includes('\0') || (text.includes('\uFFFD') && !original.includes('\uFFFD'))) return technical('RTK rewrite returned a malformed command.');
        return out({ action: 'execute', outcome: 'rewritten', command: text, path, code });
    }
    if (code === 1) {
        if (text.trim()) return technical('RTK rewrite returned exit 1 together with a command.');
        return out({ action: 'execute', outcome: 'unchanged', path, code });
    }
    if (code === 2) {
        const message = (r.stderr.trim() || text.trim()).slice(0, 500);
        return out({ action: 'deny', outcome: 'denied', path, code, diagnostic: message });
    }
    return technical(`RTK rewrite returned an unknown exit code ${code}.`);
}
