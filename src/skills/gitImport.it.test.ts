import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { issueServerCert, tlsFixtureEnabled } from '../../test/tls/certs';
import { mkTestCtx } from '../_testCtx.entry';

// A private HTTPS Git server (git http-backend behind Bun.serve with a throwaway CA) on loopback.
// The public-address gate is unit-tested separately; here gitFetch/gitPackage are called with the pinned loopback address.
const enabled = tlsFixtureEnabled();
let base = '';
let ctx: any;
let server: ReturnType<typeof Bun.serve> | null = null;
let url = '';
let first = '';
const git = (cwd: string, ...args: string[]) => {
    const out = Bun.spawnSync(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
    if (out.exitCode !== 0) throw Error(args.join(' ') + ': ' + out.stderr.toString());
    return out.stdout.toString().trim();
};
const fetchInto = async (revision?: string, path = '/repo.git') => {
    const dir = mkdtempSync(join(base, 'fetch-'));
    const fetched = await ctx.fns.skills.gitFetch({ url: url + path, address: '127.0.0.1', revision, dir, caFile: join(base, 'tls/ca.pem') });
    return { dir, fetched };
};

describe.skipIf(!enabled)('public HTTPS Git import', () => {
    beforeAll(async () => {
        base = mkdtempSync(join(tmpdir(), 'skill-git-it-'));
        mkdirSync(join(base, 'tls'));
        issueServerCert(join(base, 'tls'), 'git.example.test', ['git.example.test']);
        const work = join(base, 'work');
        mkdirSync(join(work, 'skills/review/scripts'), { recursive: true });
        mkdirSync(join(work, 'skills/summarize'), { recursive: true });
        writeFileSync(join(work, 'skills/review/SKILL.md'), '---\nname: review\ndescription: Review v1.\n---\nVersion one.\n');
        writeFileSync(join(work, 'skills/review/scripts/run.sh'), '#!/bin/sh\necho hi\n', { mode: 0o755 });
        writeFileSync(join(work, 'skills/summarize/SKILL.md'), '---\nname: summarize\ndescription: Summary.\n---\nSummarize.\n');
        mkdirSync(join(work, 'big'), { recursive: true });
        writeFileSync(join(work, 'big/SKILL.md'), '---\nname: big\ndescription: Too big.\n---\nBig.\n');
        writeFileSync(join(work, 'big/blob.bin'), Buffer.alloc(3 * 1024 * 1024, 1));
        // A filter that would run on checkout; import never checks out, so it must not run.
        writeFileSync(join(work, '.gitattributes'), 'skills/** filter=evil\n');
        git(base, 'init', '-q', 'work');
        git(work, 'add', '-A');
        git(work, 'commit', '-q', '-m', 'v1');
        first = git(work, 'rev-parse', 'HEAD');
        git(base, 'clone', '-q', '--bare', 'work', 'served/repo.git');
        // Like public forges, allow fetching any reachable commit by its id.
        git(join(base, 'served/repo.git'), 'config', 'uploadpack.allowReachableSHA1InWant', 'true');
        const served = join(base, 'served');
        server = Bun.serve({
            port: 0, hostname: '127.0.0.1',
            tls: { key: Bun.file(join(base, 'tls/srv.key')), cert: Bun.file(join(base, 'tls/srv.pem')) },
            async fetch(req) {
                const u = new URL(req.url);
                if (u.pathname.startsWith('/moved.git')) return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1:1/repo.git' + u.pathname.slice('/moved.git'.length) + u.search } });
                const proc = Bun.spawn(['git', 'http-backend'], {
                    env: { GIT_PROJECT_ROOT: served, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: u.pathname, REQUEST_METHOD: req.method, QUERY_STRING: u.search.slice(1),
                        CONTENT_TYPE: req.headers.get('content-type') ?? '', HTTP_CONTENT_ENCODING: req.headers.get('content-encoding') ?? '', PATH: process.env.PATH ?? '' },
                    stdin: req.body ? new Uint8Array(await req.arrayBuffer()) : 'ignore', stdout: 'pipe', stderr: 'ignore',
                });
                const raw = Buffer.from(await new Response(proc.stdout).arrayBuffer());
                const split = raw.indexOf('\r\n\r\n');
                const head = raw.subarray(0, split).toString().split('\r\n');
                const headers = new Headers();
                let status = 200;
                for (const line of head) {
                    const [k, ...v] = line.split(':');
                    if (k!.toLowerCase() === 'status') status = Number(v.join(':').trim().split(' ')[0]);
                    else headers.set(k!, v.join(':').trim());
                }
                return new Response(raw.subarray(split + 4), { status, headers });
            },
        });
        url = `https://git.example.test:${server.port}`;
        // Move the branch head after the first commit; a pinned fetch must still see v1.
        writeFileSync(join(work, 'skills/review/SKILL.md'), '---\nname: review\ndescription: Review v2.\n---\nVersion two.\n');
        git(work, 'commit', '-q', '-am', 'v2');
        git(work, 'push', '-q', join(served, 'repo.git'), 'main');
        ctx = await mkTestCtx({ env: { CDP_BROWSER_URL: 'http://127.0.0.1:1' } });
    }, 240_000);
    afterAll(() => { server?.stop(true); if (base) rmSync(base, { recursive: true, force: true }); });

    test('lists every package, reads one with executable bits, and pins the requested commit', async () => {
        const head = await fetchInto();
        expect(head.fetched.ok).toBe(true);
        const listed = await ctx.fns.skills.gitPackage({ dir: head.dir, commit: head.fetched.commit, action: 'list' });
        expect(listed).toEqual({ ok: true, action: 'list', packages: ['big', 'skills/review', 'skills/summarize'] });
        const latest = await ctx.fns.skills.gitPackage({ dir: head.dir, commit: head.fetched.commit, action: 'read', package: 'skills/review' });
        expect(Buffer.from(latest.files.find((f: any) => f.path === 'SKILL.md').data, 'base64').toString()).toContain('Version two.');
        expect(latest.files.find((f: any) => f.path === 'scripts/run.sh').executable).toBe(true);
        const pinned = await fetchInto(first);
        expect(pinned.fetched).toEqual({ ok: true, commit: first });
        const old = await ctx.fns.skills.gitPackage({ dir: pinned.dir, commit: first, action: 'read', package: 'skills/review' });
        expect(Buffer.from(old.files.find((f: any) => f.path === 'SKILL.md').data, 'base64').toString()).toContain('Version one.');
        // Nothing was checked out: the evil filter never ran and no working tree exists.
        expect(Bun.spawnSync(['git', 'rev-parse', '--is-bare-repository'], { cwd: pinned.dir }).stdout.toString().trim()).toBe('true');
    });

    test('oversized packages, redirects and unknown revisions are refused', async () => {
        const head = await fetchInto();
        expect(await ctx.fns.skills.gitPackage({ dir: head.dir, commit: head.fetched.commit, action: 'read', package: 'big' })).toMatchObject({ ok: false, reason: expect.stringContaining('size limits') });
        expect((await fetchInto(undefined, '/moved.git')).fetched).toMatchObject({ ok: false });
        expect((await fetchInto('no-such-branch')).fetched).toMatchObject({ ok: false, reason: 'the revision was not found' });
    });
});
