/**
 * Read GitLab projects, issues, merge requests and CI status through authenticated glab
 *
 * Use fixed GET-only resources with an explicit host and existing local CLI credentials. Returns bounded JSON with clipping metadata; excludes writes, job logs, variables and arbitrary endpoints.
 * @param opts.host Bare GitLab hostname, optionally with numeric port; no scheme or path.
 * @param opts.resource Fixed read-only API resource.
 * @param opts.project Numeric project ID or namespace/project path required for project-scoped resources.
 * @param opts.number Project-local issue/MR IID or global pipeline/job ID for singular resources. @minimum 1
 * @param opts.page Explicit list page. @default 1 @minimum 1
 * @param opts.limit Maximum requested rows per page. @default 25 @minimum 1 @maximum 100
 * @param opts.search Up to 200 characters for projects, issues or mergeRequests search.
 * @param opts.state Issue/MR list state; merged applies only to mergeRequests.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Bare GitLab hostname, optionally with numeric port; no scheme or path. */
        host: string;
        /** Fixed read-only API resource. */
        resource: "user" | "projects" | "project" | "issues" | "issue" | "mergeRequests" | "mergeRequest" | "pipelines" | "pipeline" | "jobs" | "job";
        /** Numeric project ID or namespace/project path required for project-scoped resources. */
        project?: string;
        /** Project-local issue/MR IID or global pipeline/job ID for singular resources. @minimum 1 */
        number?: number;
        /** Explicit list page. @default 1 @minimum 1 */
        page?: number;
        /** Maximum requested rows per page. @default 25 @minimum 1 @maximum 100 */
        limit?: number;
        /** Up to 200 characters for projects, issues or mergeRequests search. */
        search?: string;
        /** Issue/MR list state; merged applies only to mergeRequests. */
        state?: "opened" | "closed" | "merged" | "all";
    },
): Promise<{ data: unknown; clipped: boolean; page: number; limit: number }> {
    const host = opts.host;
    if (typeof host !== 'string') throw new Error('Invalid GitLab hostname');
    const [hostname, port, extra] = host.split(':');
    if (!hostname || hostname.length > 253 || !hostname.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label)) || extra !== undefined || (port !== undefined && (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535))) throw new Error('Invalid GitLab hostname');
    const endpoints: Record<string, string> = { user: 'user', projects: 'projects', project: '', issues: 'issues', issue: 'issues', mergeRequests: 'merge_requests', mergeRequest: 'merge_requests', pipelines: 'pipelines', pipeline: 'pipelines', jobs: 'jobs', job: 'jobs' };
    if (!Object.hasOwn(endpoints, opts.resource)) throw new Error('Unsupported resource');
    const page = opts.page ?? 1, limit = opts.limit ?? 25;
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid pagination');
    let endpoint = endpoints[opts.resource]!;
    if (!['user', 'projects'].includes(opts.resource)) {
     if (!opts.project || !opts.project.split('/').every(p => /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(p))) throw new Error('A valid project ID or path is required');
     endpoint = 'projects/' + encodeURIComponent(opts.project) + (endpoint ? '/' + endpoint : '');
    }
    if (['issue','mergeRequest','pipeline','job'].includes(opts.resource)) {
     if (!Number.isSafeInteger(opts.number) || opts.number! < 1) throw new Error('A positive numeric identifier is required');
     endpoint += '/' + opts.number;
    }
    const query = new URLSearchParams({ per_page: String(limit), page: String(page) });
    if (opts.resource === 'projects') query.set('membership', 'true');
    if (opts.search !== undefined) { if (!['projects','issues','mergeRequests'].includes(opts.resource) || opts.search.length > 200) throw new Error('Unsupported search'); query.set('search', opts.search); }
    if (opts.state !== undefined) { if (!['issues','mergeRequests'].includes(opts.resource) || !['opened','closed','merged','all'].includes(opts.state) || (opts.resource === 'issues' && opts.state === 'merged')) throw new Error('Unsupported state'); query.set('state', opts.state); }
    const { tmpdir } = await import('node:os');
    const env: Record<string,string|undefined> = { ...process.env, GLAB_CHECK_UPDATE: 'false', GLAB_PAGER: 'cat', NO_COLOR: '1' };
    for (const key of ['GITLAB_TOKEN','GITLAB_ACCESS_TOKEN','OAUTH_TOKEN','GITLAB_HOST','GL_HOST','GLAB_HOST','GLAB_TOKEN','GLAB_DEBUG','DEBUG','GIT_DIR','GIT_WORK_TREE']) delete env[key];
    let proc: ReturnType<typeof Bun.spawn< 'ignore', 'pipe', 'pipe' >>;
    try {
     proc = Bun.spawn(['glab','api',endpoint+'?'+query.toString(),'--hostname',host,'--method','GET'], { cwd: tmpdir(), env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
    } catch { throw new Error('Unable to start glab; install the CLI and authenticate the selected host locally. Raw CLI errors withheld.'); }
    let bytes = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; proc.kill(); }, 30000);
    const collect = async (stream: ReadableStream<Uint8Array>, keep: boolean) => { const reader = stream.getReader(); const chunks: Uint8Array[] = []; try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 2*1024*1024) { proc.kill(); throw new Error('GitLab output exceeded 2 MiB; narrow the request'); } if (keep) chunks.push(part.value); } } finally { reader.releaseLock(); } return keep ? Buffer.concat(chunks).toString('utf8') : ''; };
    try {
     const [output,,code] = await Promise.all([collect(proc.stdout,true),collect(proc.stderr,false),proc.exited]);
     if (timedOut) throw new Error('GitLab request timed out after 30 seconds');
     if (code !== 0) throw new Error('glab read failed (exit '+code+'). Check host authentication and access locally; raw CLI errors withheld.');
     let parsed: unknown; try { parsed=JSON.parse(output); } catch { throw new Error('GitLab did not return JSON'); }
     let clipped = false;
     const trim = (v: unknown, depth = 0): unknown => { if (typeof v === 'string' && v.length > 4000) { clipped=true;return v.slice(0,4000)+'…'; } if (depth > 10) { clipped=true;return '[depth limit]'; } if (Array.isArray(v)) { if(v.length>100)clipped=true;return v.slice(0,100).map(x=>trim(x,depth+1)); } if(v && typeof v==='object') return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,trim(x,depth+1)])); return v; };
     return { data: trim(parsed), clipped, page, limit };
    } finally { clearTimeout(timer); if(proc.exitCode===null)proc.kill(); }
}
