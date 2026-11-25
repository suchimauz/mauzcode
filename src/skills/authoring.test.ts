import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkTestCtx } from '../_testCtx.entry';

// Creator authoring end to end over real files: prepare, human review route, publication and verification.
let ctx: any;
let base = '';
let dir = '';
let library = '';
let source = '';
const as = (agent: any) => { const scoped = Object.create(ctx); scoped.session = ctx.fns.session.forAgent({ agent }); return scoped; };
const start = async (presetId = 'creator') => {
    const agent = await ctx.fns.agent.start({ model: 'mock:test', workspaceDir: dir, preset: await ctx.fns.agentPreset.resolve({ id: presetId }) });
    await ctx.fns.session.save({ agent });
    return agent;
};
/** The person's click on the review card: the real route with an owner browser session and CSRF header. */
const decide = async (inputId: string, decision: string, digest: string, user: any = { id: 'owner', role: 'owner' }) => {
    const body = new URLSearchParams({ decision, digest });
    const req = new Request('http://local/skills/review/' + inputId, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-csrf-token': 'token' }, body });
    const scoped = Object.create(ctx);
    scoped.session = { req, user };
    return scoped.fns.skills.add.decide({ req, inputId, decision, digest }).catch((error: Error & { status?: number }) => ({ error: error.message, status: error.status }));
};
const draftArgs = { source: 'draft', destination: 'workspace', name: 'review', description: 'Review the diff.', instructions: '# Review\n\nRead references/checklist.md.', extraFiles: [{ path: 'references/checklist.md', text: '- one\n' }] };

beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'skill-authoring-'));
    dir = join(base, 'project');
    library = join(base, 'library');
    source = join(base, 'source/imported');
    mkdirSync(dir, { recursive: true });
    ctx = await mkTestCtx({ env: { MAUZCODE_SKILLS_DIR: library, HOME: join(base, 'home') } });
    ctx.state.registry.agent.wakeWorker = () => {};
    ctx.state.registry.auth.verifyCsrf = async (_c: any, _s: any, o: { token: string }) => o.token === 'token';
    mkdirSync(join(source, 'scripts'), { recursive: true });
    writeFileSync(join(source, 'SKILL.md'), '---\nname: imported\ndescription: Imported skill.\nlicense: MIT\n---\nRun .claude/skills/imported/scripts/run.sh\n');
    writeFileSync(join(source, 'scripts/run.sh'), '#!/bin/sh\necho ok\n', { mode: 0o755 });
    writeFileSync(join(source, 'LICENSE'), 'MIT License\n');
}, 60_000);
afterAll(() => { if (base) { Bun.spawnSync(['chmod', '-R', 'u+w', base]); rmSync(base, { recursive: true, force: true }); } });

test('non-Creators cannot prepare, review or see add_skill; the gate runs before reading any source', async () => {
    await ctx.fns.agentPreset.create({ preset: { id: 'everything', name: 'Everything', allow: ['*'], plugins: ['*'] } });
    for (const preset of ['standard', 'everything']) {
        const agent = await start(preset);
        let read = false;
        const original = ctx.state.registry.skills.folderFiles;
        ctx.state.registry.skills.folderFiles = async (...args: any[]) => { read = true; return original(...args); };
        try {
            await expect(as(agent).fns.skills.add.prepare({ source: 'folder', destination: 'workspace', path: source })).rejects.toThrow('only to the built-in Creator');
            await expect(as(agent).fns.skills.add.review({ draftId: crypto.randomUUID() })).rejects.toThrow('only to the built-in Creator');
        } finally { ctx.state.registry.skills.folderFiles = original; }
        expect(read).toBe(false);
        expect(ctx.fns.agent.wireTools({ agent }).some((tool: any) => tool.name === 'add_skill')).toBe(false);
        expect((await ctx.fns.tools.call({ name: 'add_skill', agent, args: { action: 'review', draftId: 'x' } })).isError).toBe(true);
    }
    expect(ctx.fns.agent.wireTools({ agent: await start('creator') }).some((tool: any) => tool.name === 'add_skill')).toBe(true);
});

test('a drafted workspace skill is published only after the human approves the exact digest, then verified', async () => {
    const agent = await start();
    const staged = await as(agent).fns.skills.add.prepare(draftArgs);
    expect(staged).toMatchObject({ status: 'staged', skillId: 'skill.workspace:review', destination: 'workspace' });
    expect(existsSync(join(dir, '.mauzcode/skills/review'))).toBe(false);
    const review = await as(agent).fns.skills.add.review({ draftId: staged.draftId });
    const card = await ctx.fns.input.card({ id: review.inputId });
    expect(card).toContain('skill.workspace:review');
    expect(card).toContain('references/checklist.md');
    // Neither the agent nor generic submission can approve.
    await expect(as(agent).fns.skills.add.review({ draftId: staged.draftId, confirm: true } as any)).rejects.toThrow('only draftId');
    expect(await ctx.fns.input.submit({ id: review.inputId, values: { decision: 'approve' } })).toMatchObject({ error: expect.stringContaining('dedicated') });
    expect(await decide(review.inputId, 'approve', staged.digest, { id: 'member', role: 'member' })).toMatchObject({ status: 403 });
    expect(await decide(review.inputId, 'approve', 'f'.repeat(64))).toMatchObject({ ok: false, status: 'failed', reason: expect.stringContaining('changed') });
    expect(existsSync(join(dir, '.mauzcode/skills/review'))).toBe(false);

    const again = await as(agent).fns.skills.add.review({ draftId: (await as(agent).fns.skills.add.prepare(draftArgs)).draftId });
    const draft2 = (await ctx.fns.input.get({ id: again.inputId })).spec;
    expect(await decide(again.inputId, 'approve', draft2.digest)).toEqual({ ok: true, status: 'published', reason: 'published' });
    expect(readFileSync(join(dir, '.mauzcode/skills/review/references/checklist.md'), 'utf8')).toBe('- one\n');
    expect((await as(agent).fns.skills.read({ id: 'skill.workspace:review' })).instructions).toContain('Read references/checklist.md.');
    expect((await ctx.fns.input.get({ id: again.inputId })).result).toMatchObject({ status: 'published', skillId: 'skill.workspace:review' });
    expect(readdirSync(join(dir, '.mauzcode/skills')).filter(name => name.startsWith('.'))).toEqual([]);

    // A second package with the same ID is refused without overwriting.
    const third = await as(agent).fns.skills.add.prepare({ ...draftArgs, instructions: 'Different.' });
    const r3 = await as(agent).fns.skills.add.review({ draftId: third.draftId });
    expect(await decide(r3.inputId, 'approve', third.digest)).toMatchObject({ ok: false, reason: expect.stringContaining('already exists') });
    expect(readFileSync(join(dir, '.mauzcode/skills/review/SKILL.md'), 'utf8')).toContain('Read references/checklist.md.');
});

test('cancel and another chat cannot publish; changing workspace requires a new preparation', async () => {
    const agent = await start();
    const staged = await as(agent).fns.skills.add.prepare({ ...draftArgs, name: 'cancelled' });
    const review = await as(agent).fns.skills.add.review({ draftId: staged.draftId });
    expect(await decide(review.inputId, 'cancel', staged.digest)).toMatchObject({ status: 'cancelled' });
    expect(existsSync(join(dir, '.mauzcode/skills/cancelled'))).toBe(false);
    expect(await decide(review.inputId, 'approve', staged.digest)).toMatchObject({ ok: false, reason: expect.stringContaining('no longer open') });
    const other = await start();
    const mine = await as(agent).fns.skills.add.prepare({ ...draftArgs, name: 'mine' });
    await expect(as(other).fns.skills.add.review({ draftId: mine.draftId })).rejects.toThrow('another chat');
});

test('the native card reads the exact package as owner only and decides through the JSON route', async () => {
    ctx.state.registry.auth.csrfToken = async () => 'token';
    const agent = await start();
    const staged = await as(agent).fns.skills.add.prepare({ ...draftArgs, name: 'native' });
    const review = await as(agent).fns.skills.add.review({ draftId: staged.draftId });
    const view = async (user: any, headers: Record<string, string> = {}) => {
        const req = new Request('http://local/skills/review/' + review.inputId, { headers });
        const scoped = Object.create(ctx);
        scoped.session = { req, user };
        return scoped.fns.skills.add.view({ req, inputId: review.inputId }).catch((error: Error & { status?: number }) => ({ error: error.message, status: error.status }));
    };
    const owner = { id: 'owner', role: 'owner' };
    expect(await view({ id: 'member', role: 'member' })).toMatchObject({ status: 403 });
    expect(await view(owner, { 'sec-fetch-site': 'cross-site' })).toMatchObject({ status: 403 });
    const shown = await view(owner);
    expect(shown).toMatchObject({ available: true, state: 'open', skillId: 'skill.workspace:native', digest: staged.digest, csrfToken: 'token' });
    expect(shown.files.map((f: any) => f.path)).toEqual(['SKILL.md', 'references/checklist.md']);
    expect(shown.manifest).toContain('Read references/checklist.md.');
    expect(JSON.stringify(shown)).not.toContain('"data"');
    // The JSON decision path goes through the same protected decide.
    const route = (await import('./$route_review_$inputId_POST')).default;
    const post = async (user: any, decision: string, digest: string) => {
        const req = new Request('http://local/skills/review/' + review.inputId, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'token' }, body: JSON.stringify({ decision, digest }) });
        const scoped = Object.create(ctx);
        scoped.session = { req, user };
        return route(scoped, scoped.session, { req, params: { inputId: review.inputId } });
    };
    expect((await post({ id: 'member', role: 'member' }, 'approve', staged.digest)).status).toBe(403);
    const res = await post(owner, 'approve', staged.digest);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ ok: true, status: 'published', reason: 'published' });
    expect(await view(owner)).toMatchObject({ available: false, state: 'submitted', result: { status: 'published' } });
});

test('a folder import keeps bytes, license and executable bits; a proposed adaptation is separate and the source is untouched', async () => {
    const agent = await start();
    const before = readFileSync(join(source, 'SKILL.md'), 'utf8');
    const adapted = before.replace('.claude/skills/imported', '.mauzcode/skills/imported');
    const staged = await as(agent).fns.skills.add.prepare({ source: 'folder', destination: 'serverProject', path: source, adaptations: [{ path: 'SKILL.md', text: adapted }] });
    expect(staged.files).toEqual([
        { path: 'LICENSE', bytes: 12, executable: false, adapted: false },
        { path: 'SKILL.md', bytes: Buffer.byteLength(adapted), executable: false, adapted: true },
        { path: 'scripts/run.sh', bytes: 18, executable: true, adapted: false },
    ]);
    const review = await as(agent).fns.skills.add.review({ draftId: staged.draftId });
    const card = await ctx.fns.input.card({ id: review.inputId });
    expect(card).toContain('Proposed change');
    expect(card).toContain('the server library for this project only');
    expect(await decide(review.inputId, 'approve', staged.digest)).toMatchObject({ status: 'published' });
    const located = await ctx.fns.skills.serverLibrary({ workspace: { host: '', dir } });
    expect(readFileSync(join(located.projectDir, 'imported/SKILL.md'), 'utf8')).toBe(adapted);
    expect(statSync(join(located.projectDir, 'imported/scripts/run.sh')).mode & 0o111).not.toBe(0);
    expect(JSON.parse(readFileSync(join(located.projectDir, 'project.json'), 'utf8'))).toEqual({ host: '', dir });
    expect(readFileSync(join(source, 'SKILL.md'), 'utf8')).toBe(before);
    // Unchanged default import: the same bytes as the source.
    const plain = await as(agent).fns.skills.add.prepare({ source: 'folder', destination: 'serverGlobal', path: source });
    const loaded = await ctx.fns.skills.drafts({ action: 'load', id: plain.draftId });
    expect(Buffer.from(loaded.draft.files.find((f: any) => f.path === 'SKILL.md').data, 'base64').toString()).toBe(before);
});

test('concurrent publishers of one ID: exactly one wins, the other leaves nothing behind', async () => {
    const agent = await start();
    const a = await as(agent).fns.skills.add.prepare({ ...draftArgs, name: 'race', destination: 'serverGlobal' });
    const b = await as(agent).fns.skills.add.prepare({ ...draftArgs, name: 'race', destination: 'serverGlobal', instructions: 'Other.' });
    const [ra, rb] = await Promise.all([a, b].map(async staged => ctx.fns.skills.publish({ draft: (await ctx.fns.skills.drafts({ action: 'load', id: staged.draftId })).draft })));
    expect([ra.ok, rb.ok].sort()).toEqual([false, true]);
    expect([ra, rb].find((r: any) => !r.ok)).toMatchObject({ conflict: true });
    const located = await ctx.fns.skills.serverLibrary({ workspace: { host: '', dir } });
    expect(readdirSync(located.globalDir).filter(name => name.startsWith('.'))).toEqual([]);
});

test('invalid packages and non-public Git destinations are refused before staging', async () => {
    const agent = await start();
    await expect(as(agent).fns.skills.add.prepare({ ...draftArgs, name: 'Bad_Name' })).rejects.toThrow('not valid');
    await expect(as(agent).fns.skills.add.prepare({ ...draftArgs, extraFiles: [{ path: '../escape', text: 'x' }] })).rejects.toThrow('unsafe package path');
    await expect(as(agent).fns.skills.add.prepare({ ...draftArgs, adaptations: [{ path: 'missing.md', text: 'x' }] })).rejects.toThrow('existing file');
    for (const url of ['http://example.com/repo.git', 'https://user:pw@example.com/r.git', 'https://127.0.0.1/r.git', 'https://10.0.0.5/r.git', 'https://localhost/r.git', 'https://[::1]/r.git', 'file:///tmp/r', 'ssh://git@example.com/r.git']) {
        await expect(as(agent).fns.skills.add.prepare({ source: 'git', destination: 'workspace', url })).rejects.toThrow();
    }
    expect(await ctx.fns.skills.publicAddress({ host: '192.168.1.1' })).toMatchObject({ ok: false });
    expect(await ctx.fns.skills.publicAddress({ host: '8.8.8.8' })).toEqual({ ok: true, address: '8.8.8.8' });
});
