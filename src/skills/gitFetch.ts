type GitFetchResult = { ok: true; commit: string } | { ok: false; reason: string };
/**
 * Fetch one immutable commit of a public HTTPS Git repository into a private bare repository on the server.
 *
 * Runs git with no system or user configuration, no credentials or prompts, no redirects, no hooks, no submodules and only the https protocol, pinned to the verified public address. The download is limited in size and time and stopped when it exceeds either. Nothing is checked out or executed.
 * @param opts.url Public https URL without credentials, query or fragment.
 * @param opts.address Verified public IP address of the URL host to pin the connection to.
 * @param opts.revision Branch, tag or full commit to resolve; omit for the remote HEAD.
 * @param opts.dir Empty private directory for the bare repository.
 * @param opts.caFile Trusted CA bundle for a private test server; skills.add.prepare never passes it, so imports use the system trust store.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Public https URL without credentials, query or fragment. */
        url: string;
        /** Verified public IP address of the URL host to pin the connection to. */
        address: string;
        /** Branch, tag or full commit to resolve; omit for the remote HEAD. */
        revision?: string;
        /** Empty private directory for the bare repository. */
        dir: string;
        /** Trusted CA bundle for a private test server; never passed by skills.add.prepare. */
        caFile?: string;
    },
): Promise<GitFetchResult> {
    const { mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const MAX_BYTES = 64 * 1024 * 1024;
    const TIMEOUT_MS = 60_000;
    const url = new URL(opts.url);
    const port = url.port || '443';
    const home = join(opts.dir, '.home');
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const env: Record<string, string> = {
        PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/bin/false', SSH_ASKPASS: '/bin/false', GIT_ALLOW_PROTOCOL: 'https', GIT_LFS_SKIP_SMUDGE: '1',
    };
    const config = ['-c', 'credential.helper=', '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always',
        '-c', 'http.followRedirects=false', '-c', `http.curloptResolve=${url.hostname}:${port}:${opts.address}`, '-c', 'submodule.recurse=false',
        '-c', 'fetch.recurseSubmodules=false', '-c', 'core.fsmonitor=false', '-c', 'http.lowSpeedLimit=1024', '-c', 'http.lowSpeedTime=20',
        ...(opts.caFile ? ['-c', 'http.sslCAInfo=' + opts.caFile] : [])];
    const run = async (args: string[], watch = false): Promise<{ code: number; out: string; killed: boolean }> => {
        const proc = Bun.spawn(['git', ...config, ...args], { cwd: opts.dir, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
        let killed = false;
        const timer = setTimeout(() => { killed = true; proc.kill(); }, TIMEOUT_MS);
        const sizer = watch ? setInterval(() => {
            const du = Bun.spawnSync(['du', '-sb', opts.dir], { stdout: 'pipe', stderr: 'ignore' });
            if (Number(du.stdout.toString().split('\t')[0]) > MAX_BYTES) { killed = true; proc.kill(); }
        }, 250) : undefined;
        const out = await new Response(proc.stdout).text();
        const code = await proc.exited;
        clearTimeout(timer);
        if (sizer) clearInterval(sizer);
        return { code, out: out.slice(0, 1_000_000), killed };
    };
    if ((await run(['init', '-q', '--bare', '.'])).code !== 0) return { ok: false, reason: 'cannot create a private repository' };
    const listed = await run(['ls-remote', '--', opts.url, ...(opts.revision ? [opts.revision] : ['HEAD'])]);
    if (listed.killed) return { ok: false, reason: 'the repository did not answer in time' };
    if (listed.code !== 0) return { ok: false, reason: 'the repository is not a reachable public HTTPS Git repository' };
    const refs = listed.out.split('\n').filter(Boolean).map(line => line.split('\t') as [string, string]);
    let commit: string | undefined;
    if (opts.revision && /^[0-9a-f]{40}$/.test(opts.revision)) commit = opts.revision;
    else {
        const wanted = opts.revision ?? 'HEAD';
        const match = refs.find(([, ref]) => ref === wanted || ref === 'refs/heads/' + wanted) ?? refs.find(([, ref]) => ref === 'refs/tags/' + wanted + '^{}') ?? refs.find(([, ref]) => ref === 'refs/tags/' + wanted);
        commit = match?.[0];
    }
    if (!commit || !/^[0-9a-f]{40}$/.test(commit)) return { ok: false, reason: 'the revision was not found' };
    const fetched = await run(['fetch', '-q', '--no-tags', '--no-recurse-submodules', '--depth=1', '--', opts.url, commit], true);
    if (fetched.killed) return { ok: false, reason: `the download exceeded ${MAX_BYTES} bytes or ${TIMEOUT_MS / 1000} seconds` };
    if (fetched.code !== 0) return { ok: false, reason: 'the commit could not be fetched' };
    const verify = await run(['cat-file', '-t', commit]);
    if (verify.code !== 0 || verify.out.trim() !== 'commit') return { ok: false, reason: 'the fetched object is not a commit' };
    return { ok: true, commit };
}
