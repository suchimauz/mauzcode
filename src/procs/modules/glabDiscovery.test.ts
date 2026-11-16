import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import discover from './discover';

function fixture(user = false, entries?: Array<{ path: string; enabled: boolean }>) {
    const root = mkdtempSync(join(tmpdir(), 'glab-discovery-'));
    mkdirSync(join(root, 'src'));
    cpSync(new URL('../../../plugins/glab', import.meta.url), join(root, 'plugins/glab'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ procs: { plugins: ['./plugins'], path: [] } }));
    if (user) {
        mkdirSync(join(root, 'user/glab/src/glab'), { recursive: true });
        writeFileSync(join(root, 'user/glab/package.json'), JSON.stringify({ procs: { src: 'src' } }));
        writeFileSync(join(root, 'user/glab/src/glab/extra.ts'), 'throw new Error("never import");');
    }
    if (entries) writeFileSync(join(root, 'workspace.json'), JSON.stringify({ pluginRegistry: { version: 1, entries } }));
    return { root, ctx: { env: { WORKDIR: root, USER_PLUGINS: user ? join(root, 'user') : '' }, state: { root }, fns: {} } as any };
}

test('official glab discovers without user plugins', async () => {
    const f = fixture();
    try { const roots = await discover(f.ctx, null, {}); expect(roots.filter(r => r.name === 'glab').map(r => r.source)).toEqual(['official']); }
    finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('unrelated legacy plugin duplicates retain existing precedence', async () => {
    const f = fixture();
    try {
        for (const location of ['plugins/custom', 'user/custom']) {
            mkdirSync(join(f.root, location, 'src/custom'), { recursive: true });
            writeFileSync(join(f.root, location, 'package.json'), JSON.stringify({ procs: { src: 'src' } }));
        }
        f.ctx.env.USER_PLUGINS = join(f.root, 'user');
        const roots = (await discover(f.ctx, null, {})).filter(r => r.name === 'custom');
        expect(roots.map(r => r.source)).toEqual(['official', 'user']);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('legacy duplicate glab fails before even disjoint functions can mix', async () => {
    const f = fixture(true);
    try { await expect(discover(f.ctx, null, {})).rejects.toThrow('Select exactly one concrete path'); expect(existsSync(join(f.root, 'user/glab/src/glab/extra.ts'))).toBe(true); }
    finally { rmSync(f.root, { recursive: true, force: true }); }
});
for (const chosen of ['plugins/glab', 'user/glab']) test(`explicit registry selects only ${chosen}`, async () => {
    const f = fixture(true, [{ path: chosen, enabled: true }]);
    try { const roots = (await discover(f.ctx, null, {})).filter(r => r.name === 'glab'); expect(roots).toHaveLength(1); expect(roots[0]!.folder).toBe(join(f.root, chosen)); expect(existsSync(join(f.root, 'user/glab/src/glab/extra.ts'))).toBe(true); }
    finally { rmSync(f.root, { recursive: true, force: true }); }
});
test('explicit registry rejects both enabled glab copies', async () => {
    const f = fixture(true, [{ path: 'plugins/glab', enabled: true }, { path: 'user/glab', enabled: true }]);
    try { await expect(discover(f.ctx, null, {})).rejects.toThrow('Conflicting pluginRegistry name'); }
    finally { rmSync(f.root, { recursive: true, force: true }); }
});
