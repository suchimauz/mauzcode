import { afterAll, expect, test } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testCtx } from '../../../../src/$test';
import bash from '../../../../src/tools/bash';
import executeBash from '../../../../src/agent/executeBash';
import target from '../../../../src/workspace/target';
import resolvePath from '../../../../src/workspace/resolve';
import migration from './$migration_20370406120000_rtk_control';
import start from './$start';
import stop from './$stop';

// End-to-end through the real tools.bash + agent.executeBash with a fake `rtk` executable. Counters prove that
// preparation never runs the user command and that every call executes at most once.
const names = ['exec', 'resolve', 'probe', 'status', 'commit', 'serial', 'check', 'enable', 'disable', 'revalidate', 'prepare'] as const;
const dirs: string[] = [];
afterAll(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });

const count = async (file: string) => (await Bun.file(file).text().catch(() => '')).split('\n').filter(Boolean).length;
const lines = async (file: string) => (await Bun.file(file).text().catch(() => '')).split('\n').filter(Boolean);

/**
 * Fake rtk: `--version` is healthy, the fixed probe `rewrite "git status"` is healthy, any other `rewrite` sources
 * `$dir/rewrite.sh` with the command in $1 and logs it, and `rtk <cmd…>` runs the command after logging it.
 */
async function fake() {
    const dir = await mkdtemp(join(tmpdir(), 'rtk-bash-')); dirs.push(dir);
    await writeFile(join(dir, 'rtk'), `#!/bin/sh
case "$1" in
  --version) echo "rtk 1.2.0";;
  rewrite) shift
    if [ "$1" = "git status" ]; then echo "rtk git status"; exit 3; fi
    printf '%s\\n' "$1" >> "${dir}/rewrites"
    . "${dir}/rewrite.sh";;
  *) echo x >> "${dir}/ran"; "$@";;
esac
`);
    await chmod(join(dir, 'rtk'), 0o755);
    const set = (body: string) => writeFile(join(dir, 'rewrite.sh'), body);
    await set('printf "rtk %s" "$1"; exit 3');
    return {
        dir, PATH: `${dir}:/usr/bin:/bin`, set,
        rewrites: () => lines(join(dir, 'rewrites')),
        rtkRuns: () => count(join(dir, 'ran')),
        userRuns: () => count(join(dir, 'user')),
        mark: `echo u >> ${dir}/user`,
    };
}

async function setup(PATH: string, opts: { enable?: boolean } = {}) {
    const db = await testCtx();
    await migration.up(db);
    const remoteCalls: string[] = [];
    const ctx: any = {
        state: {}, env: {}, fns: {
            procs: { db: db.fns.procs.db, events: { refresh: () => undefined } },
            rtk: {}, agent: {}, workspace: {}, tools: {}, secrets: {},
            remote: { quote: ({ value }: any) => `'${value}'`, exec: async ({ command }: any) => { remoteCalls.push(command); return { stdout: 'remote ok', stderr: '', exitCode: 0, timedOut: false }; } },
        },
    };
    for (const name of names) { const fn = (await import(`./${name}.ts`)).default; ctx.fns.rtk[name] = (o: any = {}) => fn(ctx, null, o); }
    const probe = ctx.fns.rtk.probe;
    ctx.fns.rtk.probe = (o: any = {}) => probe({ env: { PATH }, ...o });
    ctx.fns.agent.executeBash = (o: any) => executeBash(ctx, null, o);
    ctx.fns.workspace.target = (o: any) => target(ctx, null, o);
    ctx.fns.workspace.resolve = (o: any) => resolvePath(ctx, null, o);
    ctx.fns.tools.bash = (o: any) => bash(ctx, null, o);
    ctx.fns.secrets.get = async ({ ref }: any) => ref === 'env://TOKEN' ? 'sup3r-s3cret-value' : null;
    await start(ctx, null, {});
    if (opts.enable !== false) expect((await ctx.fns.rtk.enable({})).ok).toBe(true);
    const run = (o: any) => ctx.fns.tools.bash({ cwd: '/tmp', ...o, env: { PATH, ...o.env } });
    return { ctx, run, remoteCalls };
}

test('disabled, absent/unloaded plugin and rtk:false never call RTK and run the original once', async () => {
    const f = await fake();
    const off = await setup(f.PATH, { enable: false });
    const r1 = await off.run({ command: `${f.mark}; echo hi` });
    expect(r1).toEqual({ output: 'hi', isError: false });
    expect(await f.rewrites()).toEqual([]);

    const on = await setup(f.PATH);
    const bypass = await on.run({ command: `${f.mark}; echo hi`, rtk: false });
    expect(bypass).toEqual({ output: 'hi', isError: false });
    expect(await f.rewrites()).toEqual([]);
    expect((await on.ctx.fns.rtk.status({})).enabled).toBe(true); // bypass changes nothing

    // Explicit RTK in the command is executed as written under bypass.
    const explicit = await on.run({ command: 'rtk echo direct', rtk: false });
    expect(explicit.output).toBe('direct'); expect(await f.rtkRuns()).toBe(1);

    delete on.ctx.fns.rtk.prepare; // plugin unloaded: the namespace function is gone
    expect((await on.run({ command: `${f.mark}; echo hi` })).output).toBe('hi');
    delete on.ctx.fns.rtk;
    expect((await on.run({ command: `${f.mark}; echo hi` })).output).toBe('hi');
    expect(await f.rewrites()).toEqual([]);
    expect(await f.userRuns()).toBe(4);

    // Stop invalidates verification; prepare then revalidates instead of trusting stale state.
    const again = await setup(f.PATH);
    await stop(again.ctx, null, {});
    expect(again.ctx.state.rtk.verifiedRevision).toBeUndefined();
});

test('SSH targets and remote workspaces are untouched; explicit host:"local" is prepared', async () => {
    const f = await fake();
    const { ctx, run, remoteCalls } = await setup(f.PATH);
    expect((await run({ command: 'git log', host: 'box', cwd: undefined })).output).toBe('remote ok');
    expect(remoteCalls.at(-1)).toEndWith('git log');
    const ws = Object.create(ctx); ws.session = { agent: { workspaceHost: 'box', workspaceDir: '/srv' } };
    const wsBash = (o: any) => bash(ws, ws.session, o);
    ws.fns.workspace.target = (o: any) => target(ctx, ws.session, o);
    expect((await wsBash({ command: 'ls', env: { PATH: f.PATH } })).output).toBe('remote ok');
    expect(remoteCalls.at(-1)).toEndWith('ls');
    expect(await f.rewrites()).toEqual([]);

    const local = await run({ command: 'echo hello', host: 'local' });
    expect(await f.rewrites()).toEqual(['echo hello']);
    expect(local.output).toBe('hello');
    expect(local.details.rtk).toMatchObject({ outcome: 'rewritten', original: 'echo hello', executed: 'rtk echo hello', code: 3 });
    expect(await f.rtkRuns()).toBe(1);
});

test('shell syntax is passed as one argument and never executed during preparation', async () => {
    const f = await fake();
    const { run } = await setup(f.PATH);
    await f.set('exit 1');
    const cmds = [
        `echo "a b" 'c' && ${f.mark}`,
        `{ ${f.mark}; } > /dev/null; echo $(echo sub) | cat 2>&1`,
        `X=\`echo y\`; ${f.mark}; echo "$X"`,
    ];
    for (const command of cmds) {
        const before = await f.userRuns();
        const r = await run({ command });
        expect(r.isError).toBe(false);
        expect(r.details.rtk).toMatchObject({ outcome: 'unchanged', code: 1, executed: command });
        expect(await f.userRuns()).toBe(before + 1);
    }
    expect(await f.rewrites()).toEqual(cmds.map(c => c.split('\n')[0]));
});

test('custom PATH: a different or missing rtk on the call PATH skips RTK without switching binaries', async () => {
    const f = await fake(); const other = await fake();
    const { run } = await setup(f.PATH);
    const r = await run({ command: 'echo x', env: { PATH: other.PATH } });
    expect(r.output).toContain('different rtk executable'); expect(r.output).toEndWith('x');
    expect(await f.rewrites()).toEqual([]); expect(await other.rewrites()).toEqual([]);
    const none = await run({ command: 'echo y', env: { PATH: '/usr/bin:/bin' } });
    expect(none.output).toEndWith('y');
    expect(await f.rewrites()).toEqual([]);
});

test('preparation sees the effective env and cwd; secrets are masked in output, notices and details', async () => {
    const f = await fake();
    const { ctx, run } = await setup(f.PATH);
    await f.set('printf "env=%s cwd=%s host=%s\\n" "$TOKEN" "$PWD" "${RTK_REWRITE_HOST-unset}" >&2; exit 2');
    const denied = await run({ command: `${f.mark}; echo "$TOKEN"`, secrets: { TOKEN: 'env://TOKEN' }, cwd: f.dir });
    expect(denied.isError).toBe(true);
    expect(denied.output).toContain('denied by RTK rules');
    expect(denied.output).toContain('env=[REDACTED]');
    expect(denied.output).toContain(`cwd=${f.dir}`);
    expect(denied.output).toContain('host=unset');
    expect(JSON.stringify(denied)).not.toContain('sup3r-s3cret-value');
    expect(denied.details.rtk).toMatchObject({ outcome: 'denied', code: 2, executed: null });
    expect(await f.userRuns()).toBe(0);
    expect((await ctx.fns.rtk.status({})).enabled).toBe(true); // a denial is not a technical failure

    await f.set('printf "rtk sh -c %s" "\'echo $TOKEN; echo u >> ' + f.dir + '/user\'"; exit 0');
    const rewritten = await run({ command: 'echo original', secrets: { TOKEN: 'env://TOKEN' } });
    expect(rewritten.output).toBe('[REDACTED]');
    expect(JSON.stringify(rewritten.details)).not.toContain('sup3r-s3cret-value');
    expect(rewritten.details.rtk.executed).toContain('rtk sh -c');
    expect(await f.userRuns()).toBe(1);
});

test('exit 2 without a message denies with zero executions', async () => {
    const f = await fake();
    const { run } = await setup(f.PATH);
    await f.set('exit 2');
    const r = await run({ command: f.mark });
    expect(r).toMatchObject({ isError: true, details: { rtk: { outcome: 'denied', diagnostic: '' } } });
    expect(await f.userRuns()).toBe(0);
});

test('technical failures disable RTK and run the original exactly once', async () => {
    const f = await fake();
    const cases: Array<[string, string]> = [
        ['kill -SEGV $$', 'SIGSEGV'],
        ['exit 7', 'unknown exit code 7'],
        ['exit 0', 'without a command'],
        ['printf "   "; exit 3', 'without a command'],
        ['printf "rtk ls"; exit 1', 'exit 1 together with a command'],
        ['head -c 70000 /dev/zero | tr "\\0" a; exit 0', 'more than 64 KiB'],
        ['sleep 8', 'within 5 s'],
    ];
    for (const [body, reason] of cases) {
        const { ctx, run } = await setup(f.PATH);
        await f.set(body);
        const before = await f.userRuns();
        const r = await run({ command: `${f.mark}; echo done` });
        expect(r.isError).toBe(false);
        expect(r.output).toStartWith('[rtk: disabled automatically');
        expect(r.output).toContain(reason);
        expect(r.output).toEndWith('done');
        expect(r.details.rtk).toMatchObject({ outcome: 'fallback', executed: `${f.mark}; echo done` });
        expect(await f.userRuns()).toBe(before + 1);
        const control = await ctx.fns.rtk.status({});
        expect(control.enabled).toBe(false); expect(control.reason).toContain(reason);
        // Disabled now: the next call consults nothing.
        const n = (await f.rewrites()).length;
        expect((await run({ command: 'echo next' })).output).toBe('next');
        expect((await f.rewrites()).length).toBe(n);
    }
}, 30_000);

test('caller deadline: exhausted during preparation means zero executions and a timeout, RTK stays enabled', async () => {
    const f = await fake();
    const { ctx, run } = await setup(f.PATH);
    await f.set('sleep 3; printf "rtk %s" "$1"; exit 3');
    const r = await run({ command: f.mark, timeout: 1 });
    expect(r.isError).toBe(true);
    expect(r.output).toContain('timed out after 1s');
    expect(r.output).toContain('not started');
    expect(r.details.rtk).toMatchObject({ outcome: 'deadline', executed: null });
    await Bun.sleep(2500);
    expect(await f.userRuns()).toBe(0);
    expect((await ctx.fns.rtk.status({})).enabled).toBe(true);

    // Revalidation after restart also counts toward the deadline and is not blamed on RTK.
    await start(ctx, null, {});
    const shortRun = await run({ command: f.mark, timeout: 0.05 });
    expect(shortRun.isError).toBe(true);
    expect(await f.userRuns()).toBe(0);
});

test('rewritten command runs once; its failures, timeouts and crashes are results, never retried', async () => {
    const f = await fake();
    const { ctx, run } = await setup(f.PATH);
    await f.set('printf "rtk %s" "$1"; exit 0');

    const fail = await run({ command: `${f.mark}; echo out; echo err >&2; exit 4` });
    expect(fail.isError).toBe(true);
    expect(fail.output).toBe('[exit 4]\nerr\nstdout:\nout');
    expect(await f.userRuns()).toBe(1); expect(await f.rtkRuns()).toBe(1);
    expect((await ctx.fns.rtk.status({})).enabled).toBe(true); // a nonzero user command never disables RTK

    const slow = await run({ command: `${f.mark}; echo started; sleep 5`, timeout: 1 });
    expect(slow.isError).toBe(true);
    expect(slow.output).toContain('timed out after 1s');
    expect(slow.output).toContain('started');
    expect(await f.userRuns()).toBe(2); expect(await f.rtkRuns()).toBe(2);

    // RTK itself crashes at runtime (after launch): returned as is, no fallback execution.
    await f.set(`printf "sh -c 'echo u >> ${f.dir}/user; kill -SEGV \\$\\$'"; exit 3`);
    const crash = await run({ command: 'echo never-alone' });
    expect(crash.isError).toBe(true);
    expect(await f.userRuns()).toBe(3);
    expect((await ctx.fns.rtk.status({})).enabled).toBe(true);

    // Identical replacement is valid and does not recurse.
    await f.set('printf "%s" "$1"; exit 0');
    const same = await run({ command: `${f.mark}; echo same` });
    expect(same.output).toBe('same'); expect(same.details.rtk).toMatchObject({ outcome: 'rewritten', executed: `${f.mark}; echo same` });
    expect(await f.userRuns()).toBe(4);
}, 20_000);

test('restart: saved enablement is revalidated before first use; a broken binary disables and the original runs once', async () => {
    const f = await fake();
    const { ctx, run } = await setup(f.PATH);
    await start(ctx, null, {});
    await writeFile(join(f.dir, 'rtk'), '#!/bin/sh\nkill -ILL $$\n');
    const r = await run({ command: `${f.mark}; echo ok` });
    expect(r.output).toStartWith('[rtk: disabled automatically');
    expect(r.output).toContain('SIGILL');
    expect(r.output).toEndWith('ok');
    expect(await f.userRuns()).toBe(1);
    expect((await ctx.fns.rtk.status({})).enabled).toBe(false);
});

test('disable during preparation: the original runs once, RTK replacement is not used', async () => {
    const f = await fake();
    const { ctx, run } = await setup(f.PATH);
    await f.set('sleep 0.4; printf "rtk %s" "$1"; exit 3');
    const pending = run({ command: `${f.mark}; echo plain` });
    await Bun.sleep(150);
    await ctx.fns.rtk.disable({});
    const r = await pending;
    expect(r.output).toBe('plain');
    expect(r.details.rtk).toMatchObject({ outcome: 'stale', executed: `${f.mark}; echo plain` });
    expect(await f.userRuns()).toBe(1); expect(await f.rtkRuns()).toBe(0);
});

test('user stop during preparation starts nothing', async () => {
    const f = await fake();
    const { ctx } = await setup(f.PATH);
    await f.set('sleep 0.3; printf "rtk %s" "$1"; exit 3');
    const controller = new AbortController();
    const runCtx = Object.create(ctx); runCtx.toolRun = { id: 'r', agentId: '', controller };
    const pending = bash(runCtx, null, { command: f.mark, cwd: '/tmp', env: { PATH: f.PATH } });
    await Bun.sleep(100); controller.abort();
    const r = await pending;
    expect(r.isError).toBe(true); expect(r.output).toContain('nothing was executed');
    expect(await f.userRuns()).toBe(0);
});

test('unexpected exception inside the plugin falls back to the original exactly once', async () => {
    const f = await fake();
    const { ctx, run } = await setup(f.PATH);
    ctx.fns.rtk.prepare = async () => { throw new Error('boom'); };
    const r = await run({ command: `${f.mark}; echo fine` });
    expect(r.output).toEndWith('fine'); expect(r.output).toContain('preparation failed');
    expect(await f.userRuns()).toBe(1);
});
