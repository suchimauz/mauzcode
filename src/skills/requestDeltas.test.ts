import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkModelsTestCtx, runClaimed } from '../agent/modelsTestCtx.entry';

test('skill publication and edits extend the actual mock provider request without changing its prefix', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skill-request-deltas-'));
    const manifest = (name: string, description: string, body = 'UNREAD_BODY_1') => `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`;
    const block = (name: string, description: string) => `<available-skills>\n- skill.workspace:${name} (Workspace): ${description}\n</available-skills>`;
    try {
        const ctx = await mkModelsTestCtx();
        ctx.env.MAUZCODE_SKILLS_DIR = join(dir, 'library');
        ctx.state.registry.agent.wakeWorker = () => {};
        // Pin unrelated turn inputs, not the request builder, catalogue or schema.
        ctx.state.registry.agent.statusLineForTurn = async () => '';
        ctx.state.registry.agent.functionRag = async () => null;
        const agent = await ctx.fns.agent.start({ model: 'mock/default:test', workspaceDir: dir, preset: await ctx.fns.agentPreset.resolve({ id: 'standard' }) });
        await ctx.fns.session.save({ agent });
        const publish = async (name: string, desc: string) => {
            const files = [{ path: 'SKILL.md', data: Buffer.from(manifest(name, desc)).toString('base64'), executable: false }];
            const result = await ctx.fns.skills.publish({ draft: { id: crypto.randomUUID(), agentId: agent.id, workspace: { dir, host: '' },
                destination: 'workspace', name, skillId: `skill.workspace:${name}`, digest: ctx.fns.skills.filesDigest({ files }), source: 'fixture',
                files, originals: {}, expiresAt: Date.now() + 60000 } });
            expect(result).toMatchObject({ ok: true });
            return join(dir, '.mauzcode/skills', name);
        };
        type Capture = { messages: any[]; tools: string; instructions: string; cacheKey: string; cacheable: number };
        const captures: Capture[] = [];
        const stream = ctx.state.registry.models.stream;
        ctx.state.registry.models.stream = async (c: any, s: any, o: any) => {
            captures.push({ messages: structuredClone(o.messages), tools: JSON.stringify(o.tools), instructions: o.instructions, cacheKey: o.promptCacheKey, cacheable: o.cacheableMessageCount });
            return stream(c, s, o);
        };
        const seen: string[] = [];
        const turn = async (text: string, delta?: string) => {
            const n = captures.length;
            await runClaimed(ctx, agent, text);
            expect(captures).toHaveLength(n + 1);
            const current = captures[n]!;
            const prior = captures[n - 1];
            expect(current.cacheable).toBe(current.messages.length);
            expect(current.cacheKey).toBe(agent.id);
            expect(JSON.parse(current.tools).length).toBeGreaterThan(0);
            expect(JSON.stringify(current)).not.toContain('UNREAD_BODY_');
            expect(current.messages[0].content).not.toContain('skill.workspace:');
            if (delta) seen.push(delta);
            const catalogues = current.messages.filter(m => m.message_type === 'skill_catalogue');
            expect(catalogues.every(m => !('skill_scope' in m))).toBe(true);
            expect(catalogues.map(m => [m.role, m.content, m.excluded_from_cursor])).toEqual(seen.map(content => ['user', content, true]));
            if (prior) {
                const boundary = prior.messages.length;
                expect(JSON.stringify(current.messages.slice(0, boundary))).toBe(JSON.stringify(prior.messages));
                expect(current.instructions).toBe(prior.instructions);
                expect(current.tools).toBe(prior.tools);
                expect(current.messages.slice(boundary).map(m => [m.role, m.content])).toEqual([
                    ['assistant', 'ok'], ['user', text], ...(delta ? [['user', delta]] : []),
                ]);
            }
        };
        await publish('baseline', 'Initial description.');
        await turn('first turn', block('baseline', 'Initial description.'));
        const rows = () => ctx.fns.session.getMessages({ id: agent.id });
        const before = await rows();
        const review = await publish('review', 'New description.');
        expect(await rows()).toEqual(before);
        expect(captures).toHaveLength(1);
        await ctx.fns.agent.buildLlmRequest({ agent, preview: true });
        await ctx.fns.agent.contextTokens({ agentId: agent.id });
        expect(await rows()).toEqual(before);
        await turn('after publish', block('review', 'New description.'));
        writeFileSync(join(review, 'SKILL.md'), manifest('review', 'Edited description.'));
        await turn('after descriptor edit', block('review', 'Edited description.'));
        writeFileSync(join(review, 'SKILL.md'), manifest('review', 'Edited description.', 'UNREAD_BODY_2'));
        await turn('after body edit');
        rmSync(review, { recursive: true });
        await turn('after deletion');

        const retained = await rows();
        const loaded = await ctx.fns.session.load({ id: agent.id });
        await ctx.fns.session.syncAgentState({ agent: loaded });
        expect(await ctx.fns.agent.syncSkillCatalogue({ agent: loaded })).toBe(false);
        const child = await ctx.fns.session.fork({ id: agent.id, presetId: 'minimal' });
        const inherited = await ctx.fns.agent.buildLlmRequest({ agent: child, preview: true });
        expect(inherited.messages.some((m: any) => m.message_type === 'skill_catalogue')).toBe(false);
        expect(await ctx.fns.agent.syncSkillCatalogue({ agent: child })).toBe(false);
        expect(await rows()).toEqual(retained);

        // The checkpoint deliberately retains old receipts in its canonical tail. Their
        // text/spend does not leak into the new baseline, even on the second request.
        loaded.sleepContext = { mode: 'compact', activeRevision: 3, generations: [{ revision: 3,
            sourceOffset: retained.length, tailStart: 1, model: loaded.model,
            contextMessages: [{ role: 'user', message_type: 'compaction_summary', content: 'Summary mentions skill.workspace:baseline' }] }] };
        expect(await ctx.fns.agent.syncSkillCatalogue({ agent: loaded })).toBe(true);
        expect(await ctx.fns.agent.syncSkillCatalogue({ agent: loaded })).toBe(false);
        const compact = await ctx.fns.agent.buildLlmRequest({ agent: loaded, preview: true });
        expect(compact.context.mode).toBe('compact');
        expect(compact.messages.filter((m: any) => m.message_type === 'skill_catalogue').map((m: any) => m.content)).toEqual([seen[0]]);
        expect((await rows()).slice(0, retained.length)).toEqual(retained);

        // Rollback contract: an old reader has no delivery hook and no knowledge of
        // skill_scope. It still sees ordinary user-text rows; chat history needs no
        // repair, and the historical advertisement cannot authorize a deleted skill.
        const oldRows = await ctx.fns.procs.db.select({ sql: 'SELECT role, content FROM messages WHERE agent_id = ? ORDER BY idx', params: [agent.id] });
        expect(oldRows.filter((m: any) => m.content === seen[1])).toEqual([{ role: 'user', content: seen[1] }]);
        const scoped = Object.create(ctx);
        scoped.session = ctx.fns.session.forAgent({ agent: loaded });
        await expect(scoped.fns.skills.read({ id: 'skill.workspace:review' })).rejects.toThrow('not available');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}, 60_000);
