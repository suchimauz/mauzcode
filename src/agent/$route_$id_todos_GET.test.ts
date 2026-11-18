import { expect, test } from 'bun:test';
import route from './$route_$id_todos_GET';
import authorize from '../goal/surfaceAuthorize';

function setup(scratchpad: unknown = { todos: { title: 'Work', pausedAt: 5, updatedAt: 9, tasks: [
    { id: 'a', title: 'A', instructions: 'Do A', status: 'active', startedAt: 1, activeSince: null, elapsedMs: 4, completedAt: null },
    { id: 'b', title: 'B', status: 'pending', startedAt: null, activeSince: null, elapsedMs: 0, completedAt: null },
] } }) {
    const owner: any = { created_by: 'u', run_token: null, run_state: 'idle', stopped_at: null, archived_at: null };
    const who: any = { required: true, user: { id: 'u', disabledAt: null } };
    const reads: string[] = [];
    const ctx: any = { fns: { auth: { currentUser: async () => who }, goal: {}, procs: { db: { select: async ({ sql }: any) => {
        reads.push(sql);
        if (sql.includes('created_by')) return owner.missing ? [] : [owner];
        return [{ scratchpad: typeof scratchpad === 'string' ? scratchpad : JSON.stringify(scratchpad) }];
    } } } } };
    ctx.fns.goal.surfaceAuthorize = (opts: any) => authorize(ctx, null, opts);
    const get = async () => await route(ctx, null, { req: new Request('http://local/agent/a/todos'), params: { id: 'a' } });
    return { owner, who, reads, get };
}

test('owner reads a trimmed projection without timing internals', async () => {
    const { get } = setup();
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ todos: { title: 'Work', paused: true, tasks: [
        { id: 'a', title: 'A', instructions: 'Do A', status: 'active' },
        { id: 'b', title: 'B', instructions: '', status: 'pending' },
    ] } });
});

test('an agent without todos returns null', async () => {
    const { get } = setup({ other: 1 });
    expect(await (await get()).json()).toEqual({ todos: null });
});

test('401 without a user session, 403 for another owner and 404 for unknown or archived agents, without reading todos', async () => {
    const cases: Array<[number, (f: ReturnType<typeof setup>) => void]> = [
        [401, f => { f.who.required = false; }],
        [401, f => { f.who.legacy = true; }],
        [403, f => { f.owner.created_by = 'other'; }],
        [404, f => { f.owner.missing = true; }],
        [404, f => { f.owner.archived_at = 1; }],
    ];
    for (const [status, mutate] of cases) {
        const f = setup(); mutate(f);
        const response = await f.get();
        expect(response.status).toBe(status);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(f.reads.some(sql => sql.includes('SELECT scratchpad'))).toBe(false);
    }
});
