import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import scan from './scan';
import skillData from './skillData';

const ctx = {} as Context; // The boundary needs no registry, settings, or database.

test('checks lexical and current canonical paths without hiding ordinary skills modules', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mauzcode-skill-data-'));
    try {
        const data = join(dir, '.mauzcode/skills');
        const source = join(dir, 'src/skills');
        const normal = join(source, 'normal.ts');
        const resource = join(data, 'review/example.ts');
        const link = join(source, 'alias.ts');
        await Bun.write(normal, 'export default () => 1;');
        await Bun.write(resource, 'export default () => 2;');
        await symlink(normal, link);
        expect(skillData(ctx, null, {path: normal}).blocked).toBe(false);
        expect(skillData(ctx, null, {path: resource}).blocked).toBe(true);
        expect(skillData(ctx, null, {path: link}).blocked).toBe(false);
        const scanCtx = {fns: {procs: {modules: {discover: async () => [
            {dir: join(dir, 'src'), name: 'app'}, {dir: data, name: 'mounted-data'},
        ]}}}} as unknown as Context;
        expect((await scan(scanCtx, null, {})).map(entry => entry.abs)).toEqual([normal]);
        await rm(link);
        await symlink(resource, link);
        expect(skillData(ctx, null, {path: link})).toEqual({blocked: true, canonical: resource});
        expect((await scan(scanCtx, null, {})).map(entry => entry.abs)).toEqual([normal]);

        const linkOut = join(data, 'linkOut.ts');
        await symlink(normal, linkOut);
        expect(skillData(ctx, null, {path: linkOut}).blocked).toBe(true);
        const nested = join(source, 'dirAlias');
        await symlink(join(data, 'review'), nested, 'dir');
        expect(skillData(ctx, null, {path: join(nested, 'new.ts'), allowMissing: true}).blocked).toBe(true);
        expect(skillData(ctx, null, {path: join(source, 'new/sub.ts'), allowMissing: true}).blocked).toBe(false);
        expect(skillData(ctx, null, {path: join(source, 'new.ts')}).blocked).toBe(true);
        await rm(resource);
        expect(skillData(ctx, null, {path: link, allowMissing: true})).toEqual({blocked: true, canonical: null});
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
});

test('rejects candidate data roots equal to, above, below, or aliasing a runtime source root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mauzcode-skill-overlap-'));
    try {
        const source = join(dir, 'src');
        const overlay = join(dir, '.mauzcode');
        const data = join(overlay, 'skills');
        const sibling = join(dir, 'src-docs');
        const alias = join(dir, 'alias');
        for (const path of [join(source, 'skills'), join(data, 'review'), sibling]) await mkdir(path, {recursive: true});
        await symlink(source, alias, 'dir');
        const sourceRoots = [source, overlay];
        const blocked = (path: string, workspaceDir?: string, roots = sourceRoots) =>
            skillData(ctx, null, {path, sourceRoots: roots, workspaceDir}).blocked;
        for (const path of [dir, source, join(source, 'skills'), overlay, alias, join(alias, 'skills')]) {
            expect(blocked(path, dir)).toBe(true);
        }
        expect(blocked(join(source, 'skills'), dir, [alias])).toBe(true);
        expect(blocked(sibling, dir)).toBe(false);
        expect(blocked(data)).toBe(true);
        expect(blocked(data, dir)).toBe(false);
        expect(blocked(join(data, 'review'), dir)).toBe(false);
        expect(blocked('src')).toBe(true);

        await rm(data, {recursive: true});
        await symlink(source, data, 'dir');
        expect(blocked(data, dir)).toBe(true);
        expect(blocked(join(data, 'skills'), dir)).toBe(true);
    } finally {
        await rm(dir, {recursive: true, force: true});
    }
});
