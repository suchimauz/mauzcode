import { afterAll, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testCtx } from '../../../../src/$test';
import migration from './$migration_20370406120000_rtk_control';
import start from './$start';
import stop from './$stop';

const names = ['exec', 'resolve', 'probe', 'status', 'commit', 'serial', 'check', 'enable', 'disable', 'revalidate', 'api'] as const;
const dirs: string[] = [];
afterAll(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });

/** A directory holding a fake `rtk` shell script; `body` runs for every invocation and may count calls. */
async function fake(body: string, mode = 0o755) {
    const dir = await mkdtemp(join(tmpdir(), 'rtk-fake-')); dirs.push(dir);
    await writeFile(join(dir, 'rtk'), `#!/bin/sh\necho x >> "${dir}/calls"\n${body}\n`); await chmod(join(dir, 'rtk'), mode);
    return { dir, path: `${dir}:/usr/bin:/bin`, calls: async () => (await Bun.file(join(dir, 'calls')).text().catch(() => '')).split('\n').filter(Boolean).length };
}
const healthy = `case "$1" in --version) echo "rtk 1.2.0";; rewrite) printf 'rtk %s' "$2"; exit 3;; esac`;

async function setup(PATH: string) {
    const db = await testCtx();
    await migration.up(db);
    const ctx: any = { state: {}, env: {}, fns: { procs: { db: db.fns.procs.db }, rtk: {}, auth: {}, http: {} } };
    for (const name of names) { const fn = (await import(`./${name}.ts`)).default; ctx.fns.rtk[name] = (o: any = {}) => fn(ctx, null, o); }
    const probe = ctx.fns.rtk.probe;
    ctx.fns.rtk.probe = (o: any = {}) => probe({ env: { PATH }, ...o });
    await start(ctx, null, {});
    return ctx;
}

test('default state is off and unknown; GET-style status never probes', async () => {
    const f = await fake(healthy); const ctx = await setup(f.path);
    expect(await ctx.fns.rtk.status({})).toMatchObject({ enabled: false, availability: 'unknown', path: null });
    expect((await ctx.fns.rtk.revalidate({})).ready).toBe(false);
    expect(await f.calls()).toBe(0);
});

test('probe distinguishes healthy, missing, permission, SIGILL, timeout, overflow, incompatible and policy', async () => {
    const ctx = await setup('');
    const run = async (body: string, opts: { mode?: number; timeoutMs?: number } = {}) => {
        const f = await fake(body, opts.mode); return { r: await ctx.fns.rtk.probe({ env: { PATH: f.path }, timeoutMs: opts.timeoutMs }), f };
    };
    const ok = await run(healthy);
    expect(ok.r).toMatchObject({ ok: true, code: 'ok', version: '1.2.0' }); expect(ok.r.path).toEndWith('/rtk');
    expect(await ok.f.calls()).toBe(2); // --version + rewrite, the rewritten probe is never executed
    expect((await ctx.fns.rtk.probe({ env: { PATH: '/nonexistent' } })).code).toBe('missing');
    expect((await run(healthy, { mode: 0o644 })).r.code).toBe('permission');
    const sigill = await run('kill -ILL $$');
    expect(sigill.r.code).toBe('signal'); expect(sigill.r.reason).toContain('SIGILL');
    expect((await run('sleep 5', { timeoutMs: 300 })).r.code).toBe('timeout');
    expect((await run('head -c 100000 /dev/zero')).r.code).toBe('overflow');
    expect((await run('echo "something else"')).r.code).toBe('incompatible');
    expect((await run(`case "$1" in --version) echo "rtk 1.2.0";; rewrite) printf 'rtk git status\\nrm -rf /'; exit 0;; esac`)).r.code).toBe('incompatible');
    expect((await run(`case "$1" in --version) echo "rtk 1.2.0";; rewrite) exit 2;; esac`)).r.code).toBe('policy');
    expect((await run(`case "$1" in --version) echo "rtk 1.2.0";; rewrite) exit 7;; esac`)).r.code).toBe('incompatible');
});

test('check records facts without enabling; enable requires a fresh successful check', async () => {
    const f = await fake(healthy); const ctx = await setup(f.path);
    const checked = await ctx.fns.rtk.check({});
    expect(checked.control).toMatchObject({ enabled: false, availability: 'available', version: '1.2.0' });
    expect(checked.control.checkedAt).toBeGreaterThan(0);
    const before = await f.calls();
    const enabled = await ctx.fns.rtk.enable({});
    expect(enabled.ok).toBe(true); expect(enabled.control.enabled).toBe(true);
    expect(await f.calls()).toBe(before + 2); // enable re-probes even after a successful check
    expect((await ctx.fns.rtk.revalidate({})).probed).toBe(false); // verified by the enable itself
});

test('enable against unavailable RTK fails regardless of the previous check', async () => {
    const f = await fake(healthy); const ctx = await setup(f.path);
    await ctx.fns.rtk.check({});
    await writeFile(join(f.dir, 'rtk'), '#!/bin/sh\nkill -ILL $$\n');
    const r = await ctx.fns.rtk.enable({});
    expect(r).toMatchObject({ ok: false, error: 'unavailable' });
    expect(r.control).toMatchObject({ enabled: false, availability: 'unavailable' });
});

test('disable during an enable check wins; a late success does not enable', async () => {
    const f = await fake(`case "$1" in --version) sleep 0.4; echo "rtk 1.2.0";; rewrite) printf 'rtk %s' "$2"; exit 3;; esac`); const ctx = await setup(f.path);
    const pending = ctx.fns.rtk.enable({});
    await Bun.sleep(100);
    await ctx.fns.rtk.disable({});
    const r = await pending;
    expect(r).toMatchObject({ ok: false, error: 'stale' });
    expect((await ctx.fns.rtk.status({})).enabled).toBe(false);
});

test('plugin stop during enable invalidates it', async () => {
    const f = await fake(`case "$1" in --version) sleep 0.3; echo "rtk 1.2.0";; rewrite) printf 'rtk %s' "$2"; exit 3;; esac`); const ctx = await setup(f.path);
    const pending = ctx.fns.rtk.enable({});
    await Bun.sleep(80); await stop(ctx, null, {});
    expect((await pending).error).toBe('stale');
    expect((await ctx.fns.rtk.status({})).enabled).toBe(false);
});

test('concurrent checks are serialized and each moves the revision forward', async () => {
    const f = await fake(healthy); const ctx = await setup(f.path);
    const results = await Promise.all([ctx.fns.rtk.check({}), ctx.fns.rtk.check({}), ctx.fns.rtk.check({})]);
    expect(results.every((r: any) => !r.stale)).toBe(true);
    expect(results.map((r: any) => r.control.revision)).toEqual([1, 2, 3]);
});

test('restart revalidates saved enablement before use; failure disables; recovery never re-enables', async () => {
    const f = await fake(healthy); const ctx = await setup(f.path);
    await ctx.fns.rtk.enable({});
    await start(ctx, null, {}); // simulated restart/reload: in-process verification is gone, intent persists
    expect((await ctx.fns.rtk.status({})).enabled).toBe(true);
    const ok = await ctx.fns.rtk.revalidate({});
    expect(ok).toMatchObject({ ready: true, probed: true });
    expect((await ctx.fns.rtk.revalidate({})).probed).toBe(false);

    await start(ctx, null, {});
    await writeFile(join(f.dir, 'rtk'), '#!/bin/sh\nkill -ILL $$\n');
    const bad = await ctx.fns.rtk.revalidate({});
    expect(bad).toMatchObject({ ready: false, probed: true });
    expect(bad.control).toMatchObject({ enabled: false, availability: 'unavailable' });

    await writeFile(join(f.dir, 'rtk'), `#!/bin/sh\n${healthy}\n`);
    expect((await ctx.fns.rtk.check({})).control).toMatchObject({ enabled: false, availability: 'available' });
    expect((await ctx.fns.rtk.revalidate({})).ready).toBe(false);
});

test('technical disable keeps a reason and requires an explicit checked enable', async () => {
    const f = await fake(healthy); const ctx = await setup(f.path);
    await ctx.fns.rtk.enable({});
    const off = await ctx.fns.rtk.disable({ reason: 'RTK rewrite crashed (SIGSEGV); disabled automatically.' });
    expect(off).toMatchObject({ enabled: false, reason: expect.stringContaining('SIGSEGV') });
    expect((await ctx.fns.rtk.revalidate({})).ready).toBe(false);
});

function api(ctx: any, who: any, csrf = 'good') {
    ctx.fns.auth = { currentUser: async () => who, csrfToken: async () => 'good', verifyCsrf: async ({ token }: any) => token === csrf };
    ctx.fns.http = { publicOrigin: async () => 'http://local' };
    return (method: string, body?: unknown, headers: Record<string, string> = {}) => ctx.fns.rtk.api({ req: new Request('http://local/rtk/api', { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }) });
}

test('API: owner-only, CSRF on every write, GET never probes, enable rejected when unavailable', async () => {
    const f = await fake(healthy); const ctx = await setup(f.path);
    const owner = { required: true, user: { id: 'u1', role: 'owner' } };
    expect((await api(ctx, { required: true, user: null })('GET')).status).toBe(401);
    expect((await api(ctx, { required: true, user: { id: 'u2', role: 'member' } })('POST', { action: 'enable' }, { 'x-csrf-token': 'good' })).status).toBe(403);
    const call = api(ctx, owner);
    const get = await call('GET');
    expect(get.status).toBe(200); expect((await get.json()).csrfToken).toBe('good');
    expect(await f.calls()).toBe(0);
    for (const action of ['check', 'enable', 'disable']) expect((await call('POST', { action }, { 'x-csrf-token': 'bad' })).status).toBe(403);
    expect((await call('POST', { action: 'enable' }, { 'x-csrf-token': 'good', origin: 'http://evil' })).status).toBe(403);
    expect((await call('POST', { action: 'enable', enabled: true }, { 'x-csrf-token': 'good' })).status).toBe(400);
    expect((await call('POST', { action: 'nope' }, { 'x-csrf-token': 'good' })).status).toBe(400);
    expect(await f.calls()).toBe(0);
    const checked = await (await call('POST', { action: 'check' }, { 'x-csrf-token': 'good' })).json();
    expect(checked.control).toMatchObject({ enabled: false, availability: 'available' });
    expect((await call('POST', { action: 'enable' }, { 'x-csrf-token': 'good' })).status).toBe(200);
    expect((await (await call('POST', { action: 'disable' }, { 'x-csrf-token': 'good' })).json()).control.enabled).toBe(false);
    await writeFile(join(f.dir, 'rtk'), '#!/bin/sh\nexit 1\n');
    const rejected = await call('POST', { action: 'enable' }, { 'x-csrf-token': 'good' });
    expect(rejected.status).toBe(409); expect((await rejected.json()).control.enabled).toBe(false);
});

test('missing control row reads as default off (absent migration data)', async () => {
    const ctx = await setup('');
    await ctx.fns.procs.db.run({ sql: 'DELETE FROM rtk_control', params: [] });
    expect(await ctx.fns.rtk.status({})).toMatchObject({ enabled: false, availability: 'unknown' });
    expect((await ctx.fns.rtk.check({})).control.availability).toBe('unavailable');
});
