/**
 * Cancel a reserved child and revoke its consumed capability
 *
 * Internal root-worker-authorized terminal cancellation. Root-first locking serializes consumption and revocation. Required marker remains forever on this child. User Stop needs a separate trusted adapter, not a forged worker token.
 * @param opts.rootAgentId Original accounting root.
 * @param opts.goalId Immutable root goal UUID.
 * @param opts.rootRunToken Live real root worker claim.
 * @param opts.reservationId Exact reservation UUID.
 * @param opts.reason Optional cancellation diagnostic.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Original accounting root. */
        rootAgentId: string;
        /** Immutable root goal UUID. */
        goalId: string;
        /** Live real root worker claim. */
        rootRunToken: string;
        /** Exact reservation UUID. */
        reservationId: string;
        /** Optional cancellation diagnostic. */
        reason?: string;
    },
): Promise<void> {
    if(!await ctx.fns.goal.enabled({})) throw new Error('Goal feature disabled');
    await ctx.fns.procs.db.transaction({fn:async()=>{
    await ctx.fns.goal.delegationLock({rootAgentId:opts.rootAgentId,goalId:opts.goalId,sourceAgentId:opts.rootAgentId,sourceRunToken:opts.rootRunToken});
    await ctx.fns.goal.delegationEndGrants({rootAgentId:opts.rootAgentId,goalId:opts.goalId,reservationId:opts.reservationId,reason:opts.reason??'cancelled'});
    }});
}
