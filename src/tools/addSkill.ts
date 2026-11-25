/**
 * Native `add_skill` adapter for the built-in Creator: stage a skill package or open its human review.
 *
 * Binds the invoking agent from the trusted tool invocation and delegates to skills.add.prepare or skills.add.review, which recheck the built-in Creator identity. Never publishes: only the person's decision in the review card does.
 * @param opts.action prepare stages a package; review opens the approval card for a draftId.
 * @param opts.draftId Draft id from prepare; required by review.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** prepare stages a package; review opens the approval card for a draftId. */
        action: 'prepare' | 'review';
        /** Draft id from prepare; required by review. */
        draftId?: string;
        /** Remaining prepare arguments, validated by skills.add.prepare. */
        [field: string]: unknown;
    },
): Promise<string> {
    if (!session?.agent?.id) throw new Error('add_skill: requires a trusted agent invocation');
    const { action, ...rest } = opts ?? {} as typeof opts;
    if (action === 'review') {
        if (Object.keys(rest).some(key => key !== 'draftId')) throw new Error('add_skill review accepts only draftId');
        const opened = await ctx.fns.skills.add.review({ draftId: String(rest.draftId ?? '') });
        return JSON.stringify({ ...opened, next: 'The review card is open. End your turn; the person approves or cancels it.' });
    }
    if (action !== 'prepare') throw new Error('add_skill: action must be prepare or review');
    return JSON.stringify(await ctx.fns.skills.add.prepare(rest as Parameters<typeof ctx.fns.skills.add.prepare>[0]));
}
