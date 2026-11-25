/**
 * Show the person the exact staged package for approval; publication happens only from their browser decision.
 *
 * Built-in Creator only, and only for a draft this agent prepared in its current workspace. Opens a protected review card with the full ID, destination, file inventory and content or adaptation diff, bound to the draft digest. The agent's turn should end after this call; the answer arrives as an input result. A tool argument can never approve it.
 * @param opts.draftId Draft id returned by skills.add.prepare.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Draft id returned by skills.add.prepare. */
        draftId: string;
    },
): Promise<{ inputId: string; skillId: string; digest: string }> {
    const agent = session?.agent;
    if (!agent?.id || !await ctx.fns.skills.isCreator({ agent })) throw new Error('Adding skills is available only to the built-in Creator');
    if (Object.keys(opts ?? {}).some(key => key !== 'draftId')) throw new Error('skills.add.review accepts only draftId; approval comes from the person');
    const loaded = await ctx.fns.skills.drafts({ action: 'load', id: opts.draftId });
    if (!loaded.ok) throw new Error('Draft unavailable: ' + loaded.reason);
    const draft = loaded.draft;
    if (draft.agentId !== agent.id) throw new Error('This draft belongs to another chat');
    if (draft.workspace.host !== (agent.workspaceHost ?? '') || draft.workspace.dir !== agent.workspaceDir) throw new Error('The workspace changed since the draft was prepared; prepare it again');
    if (draft.expiresAt <= Date.now()) throw new Error('The draft expired; prepare it again');
    const input = await ctx.fns.input.request({
        kind: 'skill-review', title: 'Add skill ' + draft.skillId, agentId: agent.id, waitForAnswer: true,
        message: 'Review exactly what will be saved. Approving publishes this version only.',
        spec: { draftId: draft.id, digest: draft.digest, skillId: draft.skillId, destination: draft.destination, expiresAt: draft.expiresAt },
    });
    return { inputId: input.id, skillId: draft.skillId, digest: draft.digest };
}
