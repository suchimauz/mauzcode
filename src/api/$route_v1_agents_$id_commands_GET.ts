/** Discover commands for a native client's authenticated agent session. */
export default function (ctx: Context, _session: Session | null, opts: {
    /** Incoming mobile HTTP request. */ req: Request;
    /** Agent selected by the path. */ params: {id: string};
}) {
    return ctx.fns.commands.http({req: opts.req, agentId: opts.params.id});
}
