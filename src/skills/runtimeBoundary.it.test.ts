import { expect, test } from 'bun:test';
import { mkdtemp, rename, rm, symlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { testCtx } from '../$test';

const fixtureCommand = (label: string) => JSON.stringify({
    kind: 'prompt', label, description: 'Runtime boundary fixture', template: 'Hello', icon: 'compass',
});
const procedure = (value: number) => `export default function () { return ${value}; }\n`;

async function eventually(check: () => boolean | Promise<boolean>) {
    const deadline = Date.now() + 10_000;
    do {
        if (await check()) return;
        await Bun.sleep(50);
    } while (Date.now() < deadline);
    expect(await check()).toBe(true);
}

test('boot, sync, namespace reload, def and watcher keep skill packages out of the runtime registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skill-runtime-boundary-'));
    let ctx: Context | undefined;
    try {
        const src = join(root, 'src');
        const data = join(root, '.mauzcode/skills');
        const pkg = join(data, 'boundaryfixture');
        const pkgFn = join(pkg, 'scripts/example.ts');
        const pkgCommand = join(pkg, '$command_data.json');
        const pkgType = join(pkg, 'Resource.ts');
        const normalFn = join(src, 'skills/boundaryProbe.ts');
        const normalRel = 'skills/$command_boundaryNormal.json';
        const normalCommand = join(src, normalRel);
        const aliasFn = join(src, 'skills/boundaryAlias.ts');
        const aliasRel = 'skills/$command_boundaryAlias.json';
        const aliasCommand = join(src, aliasRel);
        await Bun.write(join(root, 'package.json'), JSON.stringify({name: 'runtime-boundary-fixture'}));
        await Bun.write(join(pkg, 'SKILL.md'), '---\nname: boundaryfixture\ndescription: Inert runtime boundary fixture\n---\nFixture.\n');
        await Bun.write(pkgFn, procedure(10));
        await Bun.write(pkgCommand, fixtureCommand('Package data'));
        await Bun.write(pkgType, 'export type Resource = string;\n');
        await Bun.write(normalFn, procedure(20));
        await Bun.write(normalCommand, fixtureCommand('Runtime before edit'));
        await Bun.write(aliasFn, procedure(20));
        await symlink(pkgCommand, aliasCommand);

        const runtime = ctx = await testCtx({root, workdir: root, env: {
            PROCS_IGNORE_WORKSPACE: '1', USER_PLUGINS: '', PROCS_PLUGINS: '', PROCS_PATH: join(root, 'unused-modules'),
        }});
        expect(new URL(runtime.env.DATABASE_URL!).port).toBe('54399');
        const manifest = await runtime.fns.skills.parseManifest({
            text: await Bun.file(join(pkg, 'SKILL.md')).text(), directoryName: basename(pkg),
        });
        expect(manifest).toMatchObject({ok: true, manifest: {name: 'boundaryfixture'}});
        // Only unrelated background work is stubbed; all registry loaders, filesystem events and type generation are real.
        runtime.state.registry.runtime.docs.index = async () => ({});
        runtime.state.registry.code.index = async () => ({});
        runtime.state.registry.code.quality = async () => ({errors: 0, findings: []});
        const catalogue = async () => {
            const result = await runtime.fns.commands.catalogue({version: 2});
            if (result.version !== 2) throw new Error('expected version 2 command catalogue');
            return result.commands;
        };
        const label = async (name: string) => (await catalogue()).find(command => command.name === name)?.label;
        const assertPackageAbsent = () => {
            const registry = runtime.state.registry;
            const skills = registry.skills;
            expect(typeof skills.packageScan).toBe('function'); // the real src/skills module
            expect(skills.boundaryfixture).toBeUndefined();
            expect(runtime.state.commands.sources?.has(pkgCommand)).toBe(false);
            expect(runtime.state.commands.sources?.has(aliasCommand)).toBe(false);
            expect(runtime.state.commands.registry?.['skills.boundaryfixture:data']).toBeUndefined();
            expect(runtime.state.commands.registry?.['skills:boundaryAlias']).toBeUndefined();
        };
        const assertScan = async () => {
            const files = (await runtime.fns.procs.project.scan({})).map(entry => entry.abs)
                .filter(path => path.startsWith(root + '/'));
            expect(files).toContain(normalFn);
            expect(files).toContain(normalCommand);
            expect(files).not.toContain(pkgFn);
            expect(files).not.toContain(pkgCommand);
            expect(files).not.toContain(pkgType);
            expect(files).not.toContain(aliasCommand);
        };

        const bootFiles = (runtime.state.procs.boot.entries as Array<{abs: string}>).map(entry => entry.abs)
            .filter(path => path.startsWith(root + '/'));
        expect(bootFiles.filter(path => path.startsWith(data + '/'))).toEqual([]);
        expect(bootFiles).not.toContain(aliasCommand);
        expect(bootFiles).toContain(aliasFn);
        expect(runtime.state.registry.skills.boundaryProbe()).toBe(20);
        expect(runtime.state.registry.skills.boundaryAlias()).toBe(20);
        expect(await label('skills:boundaryNormal')).toBe('Runtime before edit');
        assertPackageAbsent();
        await assertScan();

        const roots = (await runtime.fns.procs.modules.discover({})).map(entry => entry.dir);
        // Refusing a proposed root is a data-source decision; it must not hide any existing module.
        const checkRoot = (path: string) => runtime.fns.procs.project.skillData({path, sourceRoots: roots, workspaceDir: root});
        expect(checkRoot(join(src, 'skills')).blocked).toBe(true);
        expect(checkRoot(data).blocked).toBe(false);
        expect(runtime.state.registry.skills.boundaryProbe()).toBe(20);

        await rm(aliasFn);
        await symlink(pkgFn, aliasFn);
        await Bun.write(pkgFn, procedure(11));
        await Bun.write(pkgCommand, fixtureCommand('Package after edit'));
        await Bun.write(normalFn, procedure(21));
        await Bun.write(normalCommand, fixtureCommand('Runtime after sync'));
        await expect(runtime.fns.procs.repl.load({name: 'skills.boundaryfixture.scripts.example'})).rejects.toThrow('no file');
        await expect(runtime.fns.procs.repl.load({name: 'skills.boundaryAlias'})).rejects.toThrow('no file');
        expect(await runtime.fns.procs.repl.load({name: 'skills/boundaryfixture'})).toMatchObject({count: 0});
        await expect(runtime.fns.procs.dev.sync({rel: aliasRel})).rejects.toThrow('not a runtime path');
        await expect(runtime.fns.procs.dev.sync({rel: '../.mauzcode/skills/boundaryfixture/$command_data.json'})).rejects.toThrow('not a runtime path');
        await runtime.fns.procs.dev.sync({rel: normalRel});
        expect(await label('skills:boundaryNormal')).toBe('Runtime after sync');
        await runtime.fns.procs.repl.load({name: 'skills.boundaryProbe'});
        expect(runtime.state.registry.skills.boundaryProbe()).toBe(21);
        // The earlier trusted function can stay in memory, but the retargeted alias is not imported.
        expect(runtime.state.registry.skills.boundaryAlias()).toBe(20);
        expect((await runtime.fns.procs.project.scan({})).some(entry => entry.abs === aliasFn)).toBe(false);
        assertPackageAbsent();
        await assertScan();

        const refuseCode = `export default ${fixtureCommand('Must not be written')};`;
        const before = await Bun.file(pkgCommand).text();
        await expect(runtime.fns.procs.dev.def({rel: aliasRel, code: refuseCode})).rejects.toThrow('not a runtime path');
        expect(await Bun.file(pkgCommand).text()).toBe(before);
        const newPackageRel = '../.mauzcode/skills/boundaryfixture/$command_new.ts';
        await expect(runtime.fns.procs.dev.def({rel: newPackageRel, code: refuseCode})).rejects.toThrow('not a runtime path');
        expect(await Bun.file(join(src, newPackageRel)).exists()).toBe(false);
        const createdRel = 'skills/$command_boundaryCreated.ts';
        const createdCode = `export default ${fixtureCommand('Runtime created by def')};`;
        await runtime.fns.procs.dev.def({rel: createdRel, code: createdCode});
        expect(await Bun.file(join(src, createdRel)).text()).toBe(createdCode);
        expect(await label('skills:boundaryCreated')).toBe('Runtime created by def');
        const declarations = await Bun.file(join(src, 'ctx_ns.d.ts')).text();
        expect(declarations).not.toContain('boundaryfixture');
        expect(declarations).toContain('boundaryProbe');

        const watchedRel = 'skills/$command_boundaryWatched.json';
        const linkedDirectory = join(src, 'skills/boundaryLinked');
        await runtime.fns.procs.dev.watch({});
        // Rename into src so the watcher receives files and a directory event in one batch.
        await rename(aliasCommand, join(src, watchedRel));
        const staged = `${root}-staged`;
        await symlink(pkg, staged, 'dir');
        try { await rename(staged, linkedDirectory); }
        finally { await rm(staged, {force: true}); }
        await Bun.write(normalCommand, fixtureCommand('Runtime after watch'));
        await eventually(async () => await label('skills:boundaryNormal') === 'Runtime after watch');
        expect(await label('skills:boundaryWatched')).toBeUndefined();
        expect(runtime.state.commands.sources?.has(join(src, watchedRel))).toBe(false);
        expect(runtime.state.commands.sources?.has(join(linkedDirectory, '$command_data.json'))).toBe(false);
        await rm(join(src, createdRel));
        await eventually(async () => await label('skills:boundaryCreated') === undefined);
        expect(runtime.state.commands.sources?.has(join(src, createdRel))).toBe(false);
        assertPackageAbsent();
        await assertScan();
    } finally {
        ctx?.state.watcher?.close();
        // Let the watcher finish a type-generation batch already scheduled before cleanup.
        if (ctx?.state.watcher) await Bun.sleep(250);
        await rm(root, {recursive: true, force: true});
    }
}, 60_000);
