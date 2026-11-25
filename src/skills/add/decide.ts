type DecideResult = { ok: boolean; status: 'published' | 'unverified' | 'cancelled' | 'failed'; reason?: string };
/**
 * Apply a person's browser decision on one skill review: cancel it, or publish the exact reviewed version and verify it.
 *
 * Requires the current authenticated owner HTTP request with a valid CSRF token; agents and generic input submission cannot reach it. Approval rechecks that the reviewing chat is still a built-in Creator in the same workspace, that the digest shown is the stored draft digest and that the destination is free, then publishes without replacement and verifies the saved package through the catalogue and read_skill as that agent before reporting success. A failure after publication is reported as unverified and is never reinstalled automatically.
 * @param opts.req Current authenticated browser request.
 * @param opts.inputId Review input id from the card.
 * @param opts.decision approve publishes, cancel discards the draft.
 * @param opts.digest Content digest displayed on the card; must equal the draft digest.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Current authenticated browser request. */
        req: Request;
        /** Review input id from the card. */
        inputId: string;
        /** approve publishes, cancel discards the draft. */
        decision: 'approve' | 'cancel';
        /** Content digest displayed on the card; must equal the draft digest. */
        digest: string;
    },
): Promise<DecideResult> {
    const deny = (message: string, status = 403): never => { throw Object.assign(new Error(message), { status }); };
    if (session?.req !== opts.req) deny('Skill review requires the current human browser request');
    const user = (session as Session & { user?: { id: string; role?: string } })?.user;
    if (!user || user.role !== 'owner') deny('Owner access required');
    if (!await ctx.fns.auth.verifyCsrf({ req: opts.req, token: opts.req.headers.get('x-csrf-token') ?? '' })) deny('Invalid CSRF token');
    if (opts.decision !== 'approve' && opts.decision !== 'cancel') deny('Invalid decision', 400);
    const authority = (ctx.state as any).input?.kinds?.['skill-review']?.completionAuthority;
    if (!authority) deny('Skill review is unavailable', 503);
    const input = await ctx.fns.input.get({ id: opts.inputId });
    if (!input || input.kind !== 'skill-review') deny('Unknown review', 404);
    if (input!.state !== 'open') return { ok: false, status: 'failed', reason: 'This review is no longer open' };
    const actor = 'user:' + user!.id;
    const finish = async (status: DecideResult['status'], reason: string, result: Record<string, unknown> = {}) => {
        await ctx.fns.input.complete({ id: input!.id, state: status === 'cancelled' ? 'cancelled' : 'submitted', actor, authority,
            summary: status === 'published' ? `Published and verified ${input!.spec.skillId}.` : status === 'unverified' ? `Saved ${input!.spec.skillId} but verification failed: ${reason}` : `Skill not added: ${reason}`,
            result: { status, skillId: input!.spec.skillId, reason, ...result } });
        return { ok: status === 'published', status, reason };
    };
    const loaded = await ctx.fns.skills.drafts({ action: 'load', id: String(input!.spec.draftId) });
    if (opts.decision === 'cancel') {
        await ctx.fns.skills.drafts({ action: 'delete', id: String(input!.spec.draftId) });
        return finish('cancelled', 'cancelled by the person');
    }
    if (!loaded.ok) return finish('failed', 'the staged package is unavailable; prepare it again');
    const draft = loaded.draft;
    if (opts.digest !== input!.spec.digest || draft.digest !== input!.spec.digest) return finish('failed', 'the package changed after it was shown; a new review is required');
    if (draft.expiresAt <= Date.now()) return finish('failed', 'the review expired; prepare it again');
    const agent = ctx.state.agent?.[input!.agentId] ?? await ctx.fns.session.load({ id: input!.agentId });
    if (agent.id !== draft.agentId || !await ctx.fns.skills.isCreator({ agent })) return finish('failed', 'the chat is not an authorized built-in Creator');
    if ((agent.workspaceHost ?? '') !== draft.workspace.host || agent.workspaceDir !== draft.workspace.dir) return finish('failed', 'the chat workspace changed; prepare it again');
    // One publication per draft, even with concurrent approvals in two tabs.
    const claimed = await ctx.fns.procs.db.run({ sql: "UPDATE inputs SET state='processing', updated_at=? WHERE id=? AND state='open' RETURNING id", params: [Date.now(), input!.id] });
    if (!claimed.rows.length) return { ok: false, status: 'failed', reason: 'This review is already being handled' };
    const published = await ctx.fns.skills.publish({ draft });
    if (!published.ok) return finish('failed', published.reason);
    await ctx.fns.skills.drafts({ action: 'delete', id: draft.id });
    // Verify through the same paths every reader uses.
    const scoped = Object.create(ctx) as Context;
    scoped.session = ctx.fns.session.forAgent({ agent });
    try {
        const listed = await scoped.fns.skills.list({ query: draft.skillId });
        if (!listed.skills.some(skill => skill.id === draft.skillId)) return finish('unverified', 'the skill is not visible in the catalogue', { directory: published.directory });
        const read = await scoped.fns.skills.read({ id: draft.skillId });
        const expected = draft.files.filter(file => file.path !== 'SKILL.md').map(file => file.path).sort();
        if (read.kind !== 'skill' || JSON.stringify(read.resources.map(r => r.path).sort()) !== JSON.stringify(expected)) return finish('unverified', 'the saved files differ from the reviewed package', { directory: published.directory });
        const manifest = await scoped.fns.skills.read({ id: draft.skillId, path: 'SKILL.md' });
        const original = Buffer.from(draft.files.find(file => file.path === 'SKILL.md')!.data, 'base64').toString('utf8');
        if (manifest.kind !== 'text' || (!manifest.continuation && manifest.text !== original)) return finish('unverified', 'SKILL.md differs from the reviewed version', { directory: published.directory });
    } catch (error) {
        return finish('unverified', (error as Error).message, { directory: published.directory });
    }
    return finish('published', 'published', { directory: published.directory });
}
