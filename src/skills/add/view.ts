type ReviewFile = { path: string; bytes: number; executable: boolean; adapted: boolean };
type ReviewView = {
    id: string; agentId: string; state: types.input.Row['state']; title: string; message: string;
    /** False when the staged package is gone or no longer matches the card; approval is then impossible. */
    available: boolean;
    skillId: string; destination: string; where: string; source: string; digest: string; expiresAt: number;
    files: ReviewFile[];
    /** SKILL.md text as it will be saved. */
    manifest: string;
    /** Adapted text files: original and proposed text. */
    changes: { path: string; before: string; after: string }[];
    /** Final outcome of a closed review. */
    result: { status: string; reason?: string } | null;
    /** Cookie-bound token for the approve/cancel POST. */
    csrfToken: string;
};
/**
 * Read one skill review card for the person's native React view: exact files, destination, SKILL.md and adaptation diff.
 *
 * Owner-only, same-origin browser GET. Read-only: approval still goes only through POST /skills/review/<id> with this CSRF token and the shown digest.
 * @param opts.req Current authenticated owner browser request.
 * @param opts.inputId Review input id.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Current authenticated owner browser request. */
        req: Request;
        /** Review input id. */
        inputId: string;
    },
): Promise<ReviewView> {
    const deny = (message: string, status = 403): never => { throw Object.assign(new Error(message), { status }); };
    if (session?.req !== opts.req) deny('Skill review requires the current human browser request');
    const user = (session as Session & { user?: { id: string; role?: string } })?.user;
    if (!user || user.role !== 'owner') deny('Owner access required');
    const url = new URL(opts.req.url);
    if (opts.req.headers.get('sec-fetch-site') === 'cross-site' || (opts.req.headers.get('origin') && opts.req.headers.get('origin') !== url.origin)) deny('Same origin required');
    const input = await ctx.fns.input.get({ id: opts.inputId });
    if (!input || input.kind !== 'skill-review') deny('Unknown review', 404);
    const spec = input!.spec;
    const base = {
        id: input!.id, agentId: input!.agentId, state: input!.state, title: input!.title, message: input!.message,
        skillId: String(spec.skillId ?? ''), destination: String(spec.destination ?? ''), digest: String(spec.digest ?? ''), expiresAt: Number(spec.expiresAt) || 0,
        result: input!.result ? { status: String(input!.result.status ?? ''), ...(input!.result.reason ? { reason: String(input!.result.reason) } : {}) } : null,
        csrfToken: await ctx.fns.auth.csrfToken({ req: opts.req }),
    };
    const empty = { ...base, available: false, where: '', source: '', files: [], manifest: '', changes: [] };
    if (!['open', 'processing'].includes(input!.state)) return empty;
    const loaded = await ctx.fns.skills.drafts({ action: 'load', id: String(spec.draftId) });
    if (!loaded.ok || loaded.draft.digest !== spec.digest) return empty;
    const d = loaded.draft;
    const bytes = (f: types.skills.StagedFile) => Buffer.from(f.data, 'base64');
    const text = (f?: types.skills.StagedFile) => { if (!f) return ''; try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes(f)); } catch { return ''; } };
    const where = d.destination === 'workspace' ? `${d.workspace.host ? d.workspace.host + ':' : ''}${d.workspace.dir}/.mauzcode/skills/${d.name}`
        : d.destination === 'serverProject' ? 'server library, this project only' : 'server library, all projects';
    return {
        ...base, available: true, where, source: d.source,
        files: d.files.map(f => ({ path: f.path, bytes: bytes(f).length, executable: f.executable, adapted: f.adapted === true })),
        manifest: text(d.files.find(f => f.path === 'SKILL.md')),
        changes: Object.entries(d.originals).map(([path, before]) => ({ path, before, after: text(d.files.find(f => f.path === path)) })),
    };
}
