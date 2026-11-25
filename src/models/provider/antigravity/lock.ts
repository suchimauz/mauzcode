/**
 * Run a callback under the per-connection Antigravity credential lock
 *
 * Use inside the antigravity provider to serialize login completion with logout: logout cancels the flow and
 * deletes the grant under this lock, and a token exchange stores its grant under it only while its flow is still
 * current and pending, so a late exchange can never restore credentials after logout. Callers queue in order; a
 * failing callback releases the lock and rethrows. Process-local.
 * @param opts.connectionId Connection id whose credential writes are serialized.
 * @param opts.run Callback to run exclusively; keep it short and network-free.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Connection id whose credential writes are serialized. */
        connectionId: string;
        /** Callback to run exclusively; keep it short and network-free. */
        run: () => Promise<unknown>;
    },
): Promise<unknown> {
    ctx.state.models ??= {};
    const state = ctx.state.models as typeof ctx.state.models & { antigravityLocks?: Record<string, Promise<void>> };
    const locks = (state.antigravityLocks ??= {});
    const previous = locks[opts.connectionId] ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => mine);
    locks[opts.connectionId] = tail;
    await previous;
    try { return await opts.run(); }
    finally {
        release();
        if (locks[opts.connectionId] === tail) delete locks[opts.connectionId];
    }
}
