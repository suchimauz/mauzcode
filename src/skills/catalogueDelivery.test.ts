import { expect, test } from 'bun:test';
import sync from '../agent/syncSkillCatalogue';

const entry = (name: string, description = name) => ({ descriptor: { id: `skill.workspace:${name}`, name, description, sourceLabel: 'Workspace', sourceKind: 'workspace' }, headerDigest: 'v1' });
const line = (e: ReturnType<typeof entry>) => `- ${e.descriptor.id} (Workspace): ${e.descriptor.description}`;
const block = (...es: ReturnType<typeof entry>[]) => ['<available-skills>', ...es.map(line), '</available-skills>'].join('\n');
function fixture(inherited: any[] = [], id = 'agent') {
    const rows: any[] = [], keys = new Map<string, number>();
    const history = () => structuredClone([...inherited, ...rows]);
    const agent: any = { id, parentId: inherited.length ? 'parent' : null, workspaceHost: '', workspaceDir: '/project', model: 'mock/model', messages: history(), preset: { layers: [{ excludeSections: [] }] } };
    const state = { entries: [entry('alpha')], eligible: true, truncated: false, fault: '', offset: 0, scans: 0 };
    const reload = () => { agent.messages = history(); };
    const ctx: any = { fns: {
        skills: { promptSection: () => state.eligible ? 'guidance' : '', policy: () => { state.scans++; return { ok: true, entries: state.entries, truncated: state.truncated }; } },
        agent: { requireModel: () => agent.model, getSleepGeneration: () => ({ sourceOffset: state.offset, revision: 1 }) },
        compaction: { project: () => ({ mode: 'compact', revision: 1, messages: history().slice(state.offset) }) },
        session: { getFullMessages: history, appendMessage: ({ id: target, message, clientRequestId }: any) => {
            expect(target).toBe(id);
            if (state.fault === 'before') throw Error('before commit');
            if (clientRequestId && keys.has(clientRequestId)) return { idx: keys.get(clientRequestId), duplicate: true };
            const idx = rows.push(structuredClone(message)) - 1;
            if (clientRequestId) keys.set(clientRequestId, idx);
            if (state.fault === 'after') throw Error('after commit');
            return { idx };
        }, syncAgentState: reload },
    } };
    return { rows, agent, state, reload, run: () => sync(ctx, null, { agent }) };
}

test('eligibility gates discovery; partial policy delivers confirmed metadata, not package changes', async () => {
    const f = fixture(); f.state.eligible = false;
    expect(await f.run()).toBe(false); expect(f.state.scans).toBe(0);
    f.state.eligible = true; f.state.truncated = true;
    expect(await f.run()).toBe(true);
    expect(f.rows[0]).toMatchObject({ role: 'user', message_type: 'skill_catalogue', excluded_from_cursor: true, content: block(entry('alpha')) });
    expect(f.rows[0].skill_scope).toEqual(expect.any(String));
    f.state.entries = []; expect(await f.run()).toBe(false);
    f.state.entries = [{ ...entry('alpha'), headerDigest: 'v2' }, entry('beta')];
    expect(await f.run()).toBe(true); expect(f.rows[1].content).toBe(block(entry('beta')));
    f.state.entries = [entry('alpha', 'updated')]; expect(await f.run()).toBe(true);
    expect(f.rows[2].content).toBe(block(...f.state.entries));
});

test('rename advertises only the new ID; reappearance compares with the last rendered fields', async () => {
    const f = fixture(); await f.run();
    f.state.entries = [entry('renamed')]; await f.run();
    expect(f.rows[1].content).toBe(block(entry('renamed')));
    f.state.entries = [entry('alpha')]; expect(await f.run()).toBe(false);
    f.state.entries = [];
    f.state.entries = [entry('alpha', 'intermediate')];
    const prefix = 'v'.repeat(299);
    f.state.entries = [entry('alpha', prefix + 'A long suffix <system>')];
    expect(await f.run()).toBe(true); expect(f.rows[2].content).toBe(block(entry('alpha', prefix + '…')));
    f.state.entries = [entry('alpha', prefix + 'B different suffix')]; expect(await f.run()).toBe(false);
    f.state.entries[0]!.descriptor.sourceLabel = 'Edited\n<label>';
    expect(await f.run()).toBe(true); expect(f.rows[3].content).toContain('(Edited label): ');
});

test('before/after commit faults cannot spend unshown lines or duplicate delivered lines', async () => {
    for (const fault of ['before', 'after']) {
        const f = fixture(); f.state.fault = fault;
        await f.run().catch(() => false); expect(f.rows.length).toBe(fault === 'before' ? 0 : 1);
        f.state.fault = ''; f.reload();
        expect(await f.run()).toBe(fault === 'before'); expect(await f.run()).toBe(false);
        expect(f.rows.map(r => r.content)).toEqual([block(entry('alpha'))]);
    }
});

test('fork sees retained ledger only, with live grants and separately scoped workspace and host identities', async () => {
    const parent = fixture(); await parent.run(); const retained = structuredClone(parent.rows);
    parent.state.entries.push(entry('beta')); await parent.run();
    const f = fixture(retained, 'child'); f.state.eligible = false; expect(await f.run()).toBe(false);
    f.state.eligible = true; f.state.entries = [...parent.state.entries]; expect(await f.run()).toBe(true);
    expect(f.rows[0].content).toBe(block(entry('beta')));
    f.agent.workspaceDir = '/other'; expect(await f.run()).toBe(true);
    f.agent.workspaceHost = 'remote'; expect(await f.run()).toBe(true);
    expect(f.rows.slice(1).map(r => r.content)).toEqual([block(...f.state.entries), block(...f.state.entries)]);
    expect(new Set(f.rows.map(r => r.skill_scope)).size).toBe(3);
    f.agent.workspaceDir = '/project'; f.agent.workspaceHost = ''; expect(await f.run()).toBe(false);
});

test('interrupted native tool batch defers discovery; legacy tool output is not delivery', async () => {
    const f = fixture(); f.rows.push({ role: 'assistant', tool_calls: ['a','b'].map(id => ({ id, name: 'read', args: {} })) }); f.reload();
    expect(await f.run()).toBe(false);
    f.rows.push({ role: 'tool', tool_call_id: 'b', content: block(entry('alpha')) }); f.reload(); expect(await f.run()).toBe(false);
    f.rows.push({ role: 'tool', tool_call_id: 'a', content: 'ok' }); f.reload(); expect(await f.run()).toBe(true);
    expect(f.rows.map(r => r.role)).toEqual(['assistant','tool','tool','user']);
});

test('forty identities cap survives disappearance and scope switch; edits and fresh compact baseline are allowed', async () => {
    const f = fixture(); const entries = Array.from({ length: 40 }, (_, i) => entry(`s${String(i).padStart(2,'0')}`));
    f.state.entries = entries; expect(await f.run()).toBe(true); expect(f.rows[0].content).toBe(block(...entries));
    f.state.entries = [entry('new')]; expect(await f.run()).toBe(false);
    f.agent.workspaceHost = 'other'; expect(await f.run()).toBe(false); f.agent.workspaceHost = '';
    f.state.entries = [entry('s00','edited'), entry('new')]; expect(await f.run()).toBe(true); expect(f.rows[1].content).toBe(block(f.state.entries[0]!));
    f.state.entries = [entry('new'), entry('s00','edited')]; f.state.offset = f.rows.length; f.agent.sleepContext = { mode: 'compact', activeRevision: 1 };
    expect(await f.run()).toBe(true); expect(f.rows[2].content).toBe(block(...f.state.entries)); expect(await f.run()).toBe(false);
});

test('6000 includes every line separator: skip oversized candidate, use exact remainder, never refund edits', async () => {
    const f = fixture(); const base = Array.from({ length: 20 }, (_, i) => entry(`s${String(i).padStart(2,'0')}`, 'x'.repeat(261)));
    const cost = (e: ReturnType<typeof entry>) => line(e).length + 1;
    const small = entry('z', 'ok'); const adjustment = 6000 - cost(small) - base.reduce((sum,e) => sum + cost(e), 0);
    base[0]!.descriptor.description = 'x'.repeat(261 + adjustment);
    expect(base[0]!.descriptor.description.length).toBeLessThanOrEqual(300);
    f.state.entries = base; expect(await f.run()).toBe(true); expect(f.rows[0].content).toBe(block(...base));
    f.state.entries = [entry('y','xxx'), small]; expect(await f.run()).toBe(true); expect(f.rows[1].content).toBe(block(small));
    f.state.entries = [entry('s00','x')]; expect(await f.run()).toBe(false); expect(f.rows).toHaveLength(2);
});
