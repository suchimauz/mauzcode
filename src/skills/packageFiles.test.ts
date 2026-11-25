import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import { closeSync, existsSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testCtx } from '../$test';

// Every fixture below is a private directory under the system temporary
// directory: nothing here touches a real skill root, the checkout or a user
// package, and no package content is imported or executed. Sizes are produced
// with sparse files, so a boundary at the documented 8 MiB limit costs no disk.

let ctx: Context;
let base = '';
let limits: types.skills.Limits;
let outside = '';
const hasMkfifo = spawnSync('mkfifo', ['--version']).status === 0;

function manifest(name: string, extra = ''): string {
    return `---\nname: ${name}\ndescription: Explain what this skill does and when to use it.\n${extra}---\n`;
}

/** A valid manifest whose whole header is exactly `bytes` long, padded with a YAML comment. */
function sized(name: string, bytes: number): string {
    const head = `---\nname: ${name}\ndescription: Explain what this skill does.\n`;
    const tail = '---\n';
    const fill = bytes - Buffer.byteLength(head) - Buffer.byteLength(tail);
    if (fill < 2) throw new Error('header size below the fixed part');
    return head + '#' + 'x'.repeat(fill - 2) + '\n' + tail;
}

function pkg(anchor: string, name: string, header?: string, body = 'Instructions go here.\n'): string {
    const dir = join(anchor, name);
    mkdirSync(dir, { recursive: true });
    if (header !== undefined) writeFileSync(join(dir, 'SKILL.md'), header + body, { mode: 0o600 });
    return dir;
}

function sparseFile(path: string, size: number): void {
    const fd = openSync(path, 'w', 0o600);
    try {
        ftruncateSync(fd, size);
    } finally {
        closeSync(fd);
    }
}

function anchor(name: string): string {
    const dir = join(base, name);
    mkdirSync(dir, { recursive: true });
    return dir;
}

// The result is a three-way union (inventory, page, refusal), so helpers narrow on action as well as ok.
type Inventory = Extract<types.skills.FilesResult, { ok: true; action: 'list' }>;
type Page = Extract<types.skills.FilesResult, { ok: true; action: 'read' }>;

function listed(result: types.skills.FilesResult): Inventory {
    if (!result.ok) throw new Error(result.reason);
    if (result.action !== 'list') throw new Error('expected an inventory, received a page');
    return result;
}

function paged(result: types.skills.FilesResult): Page {
    if (!result.ok) throw new Error(result.reason);
    if (result.action !== 'read') throw new Error('expected a page, received an inventory');
    return result;
}

beforeAll(async () => {
    ctx = await testCtx();
    limits = await ctx.fns.skills.packageLimits({});
    base = mkdtempSync(join(tmpdir(), 'skills-files-'));
    outside = join(base, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'secret.txt'), 'outside secret\n', { mode: 0o600 });
    writeFileSync(join(outside, 'SKILL.md'), manifest('outside'), { mode: 0o600 });
}, 60_000);

afterAll(() => {
    if (base) rmSync(base, { recursive: true, force: true });
});

describe('documented limits', () => {
    test('orders the limits the reader actually enforces', async () => {
        expect(limits.pageBytes).toBeLessThan(limits.resourceBytes);
        expect(limits.resourceBytes).toBeLessThanOrEqual(limits.packageBytes);
        expect(limits.headerBytes).toBeLessThan(limits.instructionsBytes);
        expect(limits.packages).toBeGreaterThan(0);
        expect(limits.entries).toBeGreaterThan(0);
        expect(limits.resources).toBeGreaterThan(0);
        expect(limits.depth).toBeGreaterThan(0);
        // Limits are data: the same call twice must not drift.
        expect(await ctx.fns.skills.packageLimits({})).toEqual(limits);
    });

    test('quotes every enforced limit in the documentation', () => {
        // The doc table is the promise callers read; if the numbers drift apart, one of them lies.
        const doc = readFileSync(join(import.meta.dir, '../../docs/project-agent-skills.md'), 'utf8');
        for (const [name, value] of Object.entries(limits)) {
            const grouped = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            expect({ name, quoted: doc.includes(grouped) }).toEqual({ name, quoted: true });
        }
    });

    test('the minimal package in the documentation passes the real parser', async () => {
        const doc = readFileSync(join(import.meta.dir, '../../docs/project-agent-skills.md'), 'utf8');
        const blocks = [...doc.matchAll(/```markdown\n([\s\S]*?)```/g)].map(match => match[1]!);
        expect(blocks.length).toBe(1);
        const parsed = await ctx.fns.skills.parseManifest({ text: blocks[0]!, directoryName: 'review' });
        if (!parsed.ok) throw new Error('the documented example was rejected: ' + parsed.reason);
        expect(parsed.manifest.name).toBe('review');
        expect(parsed.manifest.license).toBe('MIT');
        expect(parsed.manifest.metadata).toEqual({ author: 'team' });
        // The example is also discoverable as written, not just parseable.
        const root = anchor('documented');
        pkg(root, 'review', blocks[0]!);
        mkdirSync(join(root, 'review', 'references'));
        const checklist = '- [ ] read the diff\n';
        writeFileSync(join(root, 'review', 'references', 'checklist.md'), checklist, { mode: 0o600 });
        const scan = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace' });
        if (!scan.ok) throw new Error(scan.reason);
        expect(scan.packages.map(entry => entry.descriptor.id)).toEqual(['skill.workspace:review']);
        const files = listed(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'review' }));
        expect(files.resources).toEqual([{ path: 'references/checklist.md', bytes: Buffer.byteLength(checklist) }]);
    });
});

describe('bounded discovery', () => {
    test('reads only each manifest header and never the instructions body', async () => {
        const root = anchor('discovery');
        const bodies = ['alpha body marker', 'beta body marker', 'gamma body marker'];
        const headers = [manifest('alpha'), manifest('beta'), manifest('gamma')];
        headers.forEach((header, index) => pkg(root, ['alpha', 'beta', 'gamma'][index]!, header, bodies[index]! + '\n'));
        const result = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace' });
        if (!result.ok) throw new Error(result.reason);
        expect(result.packages.map(entry => entry.descriptor.id)).toEqual(['skill.workspace:alpha', 'skill.workspace:beta', 'skill.workspace:gamma']);
        for (const [index, entry] of result.packages.entries()) {
            expect(entry.headerBytes).toBe(Buffer.byteLength(headers[index]!));
            expect(entry.manifest.description).toBe('Explain what this skill does and when to use it.');
        }
        const serialized = JSON.stringify(result);
        for (const body of bodies) expect(serialized).not.toContain(body);
        expect(result.truncated).toBe(false);
        expect(result.diagnostics).toEqual([]);
    });

    test('isolates one malformed package without spending the package budget', async () => {
        const root = anchor('isolation');
        pkg(root, 'a-broken', '---\nname: a-broken\n---\n');
        pkg(root, 'b-mismatch', manifest('other-name'));
        pkg(root, 'c-good', manifest('c-good'));
        const result = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace', packageLimit: 1 });
        if (!result.ok) throw new Error(result.reason);
        expect(result.packages.map(entry => entry.directoryName)).toEqual(['c-good']);
        expect(result.diagnostics.length).toBeGreaterThanOrEqual(2);
        for (const line of result.diagnostics) expect(line.length).toBeLessThanOrEqual(limits.diagnosticChars);
        // Every candidate was examined, so the scan was not cut short: rejection alone is not truncation.
        expect(result.truncated).toBe(false);
        // One more healthy neighbour than the budget allows is what truncation reports.
        pkg(root, 'd-also-good', manifest('d-also-good'));
        const cut = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace', packageLimit: 1 });
        if (!cut.ok) throw new Error(cut.reason);
        expect(cut.packages.map(entry => entry.directoryName)).toEqual(['c-good']);
        expect(cut.truncated).toBe(true);
    });

    test('reads no byte of the instructions body at discovery', async () => {
        // The reported header length alone cannot prove what was read physically, so the number of bytes
        // readSync actually returned for this fixture's own inode is what gets asserted.
        const root = anchor('physical-read');
        const header = manifest('review');
        const file = join(pkg(root, 'review'), 'SKILL.md');
        writeFileSync(file, header + 'Sample instructions.\n'.repeat(80), { mode: 0o600 });
        const census = statSync(file);
        let observed = 0;
        const realRead = fs.readSync;
        const spy = spyOn(fs, 'readSync');
        spy.mockImplementation(((fd: number, buffer: NodeJS.ArrayBufferView, offset: number, length: number, position: number | null) => {
            const count = realRead(fd, buffer, offset, length, position);
            const info = statSync('/proc/self/fd/' + fd, { throwIfNoEntry: false });
            if (info && info.dev === census.dev && info.ino === census.ino) observed += count;
            return count;
        }) as typeof fs.readSync);
        let scan: types.skills.ScanResult;
        try {
            scan = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace' });
        } finally {
            spy.mockRestore();
        }
        if (!scan.ok) throw new Error(scan.reason);
        expect(scan.packages.map(entry => entry.directoryName)).toEqual(['review']);
        expect(observed).toBeGreaterThan(0);
        expect(observed).toBe(Buffer.byteLength(header));
    });

    test('clips a long diagnostic to the documented length, ellipsis included', async () => {
        const root = anchor('diagnostic-length');
        pkg(root, 'review', manifest('review'));
        mkdirSync(join(root, 'a'.repeat(limits.diagnosticChars + 1)));
        const result = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace' });
        if (!result.ok) throw new Error(result.reason);
        expect(result.diagnostics.length).toBeGreaterThan(0);
        for (const line of result.diagnostics) expect(line.length).toBeLessThanOrEqual(limits.diagnosticChars);
    });

    test('accepts a header of exactly the limit and rejects one byte more', async () => {
        const root = anchor('header-size');
        pkg(root, 'fits', sized('fits', limits.headerBytes));
        pkg(root, 'over', sized('over', limits.headerBytes + 1));
        const result = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace' });
        if (!result.ok) throw new Error(result.reason);
        expect(result.packages.map(entry => entry.directoryName)).toEqual(['fits']);
        expect(result.packages[0]!.headerBytes).toBe(limits.headerBytes);
        expect(result.diagnostics.join('\n')).toContain('over');
        // A caller cannot raise a documented ceiling.
        const raised = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace', headerMaxBytes: limits.headerBytes + 1024 });
        if (!raised.ok) throw new Error(raised.reason);
        expect(raised.packages.map(entry => entry.directoryName)).toEqual(['fits']);
        // It can lower it.
        const lowered = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace', headerMaxBytes: 512 });
        if (!lowered.ok) throw new Error(lowered.reason);
        expect(lowered.packages).toEqual([]);
    });

    test('counts container entries as they are read and reports truncation', async () => {
        const root = anchor('entry-budget');
        pkg(root, 'aaa', manifest('aaa'));
        pkg(root, 'bbb', manifest('bbb'));
        pkg(root, 'ccc', manifest('ccc'));
        const result = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace', entryLimit: 2 });
        if (!result.ok) throw new Error(result.reason);
        expect(result.packages.length).toBe(2);
        expect(result.truncated).toBe(true);
        const raised = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace', entryLimit: limits.entries + 100 });
        if (!raised.ok) throw new Error(raised.reason);
        expect(raised.packages.length).toBe(3);
    });

    test('does not follow a symlinked package directory out of the container', async () => {
        const root = anchor('package-link');
        pkg(root, 'real', manifest('real'));
        symlinkSync(outside, join(root, 'linked'));
        const result = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace' });
        if (!result.ok) throw new Error(result.reason);
        expect(result.packages.map(entry => entry.directoryName)).toEqual(['real']);
        expect(result.diagnostics.join('\n')).toContain('linked');
        expect(JSON.stringify(result)).not.toContain(outside);
    });

    test('rejects a symlinked anchor and a missing anchor without exposing the target', async () => {
        const root = anchor('anchor-link');
        const link = join(base, 'anchor-link-alias');
        symlinkSync(root, link);
        const linked = await ctx.fns.skills.packageScan({ anchorDir: link, sourceKind: 'workspace' });
        expect(linked.ok).toBe(false);
        if (linked.ok) return;
        expect(linked.reason).not.toContain(root);
        const missing = await ctx.fns.skills.packageScan({ anchorDir: join(base, 'no-such-root'), sourceKind: 'workspace' });
        expect(missing.ok).toBe(false);
        const relative = await ctx.fns.skills.packageScan({ anchorDir: './src', sourceKind: 'workspace' });
        expect(relative.ok).toBe(false);
        const traversal = await ctx.fns.skills.packageScan({ anchorDir: join(base, 'a', '..', 'b'), sourceKind: 'workspace' });
        expect(traversal.ok).toBe(false);
    });

    test('refuses to open a special file named SKILL.md', async () => {
        if (!hasMkfifo) return;
        const root = anchor('special-manifest');
        const dir = pkg(root, 'pipe-package');
        expect(spawnSync('mkfifo', [join(dir, 'SKILL.md')]).status).toBe(0);
        const started = Date.now();
        const result = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace' });
        expect(Date.now() - started).toBeLessThan(10_000);
        if (!result.ok) throw new Error(result.reason);
        expect(result.packages).toEqual([]);
        expect(result.diagnostics.join('\n')).toContain('regular file');
    });
});

describe('bounded package inventory', () => {
    test('lists packaged resources with verified sizes and skips links and special files', async () => {
        const root = anchor('inventory');
        const pack = pkg(root, 'review', manifest('review'));
        writeFileSync(join(pack, 'SKILL.md'), manifest('review') + 'Body.\n', { mode: 0o600 });
        mkdirSync(join(pack, 'references'));
        writeFileSync(join(pack, 'references', 'checklist.md'), 'one\ntwo\n', { mode: 0o600 });
        mkdirSync(join(pack, 'scripts'));
        writeFileSync(join(pack, 'scripts', 'run.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o600 });
        symlinkSync(join(outside, 'secret.txt'), join(pack, 'references', 'escape.md'));
        if (hasMkfifo) expect(spawnSync('mkfifo', [join(pack, 'scripts', 'pipe')]).status).toBe(0);
        const started = Date.now();
        const result = listed(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'review' }));
        expect(Date.now() - started).toBeLessThan(10_000);
        expect(result.resources).toEqual([
            { path: 'references/checklist.md', bytes: 8 },
            { path: 'scripts/run.sh', bytes: 17 },
        ]);
        expect(result.manifestBytes).toBe(Buffer.byteLength(manifest('review') + 'Body.\n'));
        expect(result.manifestOversized).toBe(false);
        expect(result.skipped).toBe(hasMkfifo ? 2 : 1);
        expect(result.truncated).toBe(false);
        expect(JSON.stringify(result)).not.toContain('outside secret');
    });

    test('reports an oversized manifest without reading it', async () => {
        const root = anchor('oversized-manifest');
        const pack = pkg(root, 'huge', manifest('huge'));
        sparseFile(join(pack, 'SKILL.md'), limits.instructionsBytes + 1);
        const result = listed(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'huge' }));
        expect(result.manifestBytes).toBe(limits.instructionsBytes + 1);
        expect(result.manifestOversized).toBe(true);
    });

    test('an unmeasurable file leaves the package total unproven and withholds every page', async () => {
        // An object whose type cannot be established is not a confirmed link or special file: its size is
        // unknown, so a partial sum must never be reported as the package total.
        const root = anchor('unmeasured');
        const pack = pkg(root, 'review', manifest('review'));
        writeFileSync(join(pack, 'summary.md'), 'A summary.\n', { mode: 0o600 });
        const target = statSync(join(pack, 'summary.md'));
        const realFstat = fs.fstatSync;
        let failures = 0;
        const spy = spyOn(fs, 'fstatSync');
        spy.mockImplementation(((fd: number, options?: unknown) => {
            const info = (realFstat as (a: number, b?: unknown) => ReturnType<typeof fs.fstatSync>)(fd, options);
            if (info.dev === target.dev && info.ino === target.ino) {
                failures++;
                throw Object.assign(new Error('synthetic read failure in a local fixture'), { code: 'EIO' });
            }
            return info;
        }) as typeof fs.fstatSync);
        let inventory: types.skills.FilesResult;
        let page: types.skills.FilesResult;
        try {
            inventory = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'review' });
            page = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'review', action: 'read', path: 'SKILL.md' });
        } finally {
            spy.mockRestore();
        }
        expect(failures).toBeGreaterThan(0);
        const full = listed(inventory);
        expect(full.packageBytes).toBeUndefined();
        expect(full.truncated).toBe(true);
        expect(page.ok).toBe(false);
        // The refusal is bounded and names no local path.
        if (!page.ok) {
            expect(page.reason.length).toBeLessThanOrEqual(limits.diagnosticChars);
            expect(page.reason).not.toContain(base);
        }
        // A healthy neighbour is unaffected by the broken one.
        pkg(root, 'neighbour', manifest('neighbour'));
        const after = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'neighbour' });
        expect(after.ok).toBe(true);
    });

    test('an I/O failure while listing a directory is a bounded result, not a rejected promise', async () => {
        const root = anchor('directory-io');
        const pack = pkg(root, 'review', manifest('review'));
        writeFileSync(join(pack, 'summary.md'), 'A summary.\n', { mode: 0o600 });
        // The reader names directories through /proc/self/fd, so the failing handle is selected by comparing the
        // real path behind that descriptor with the fixture's own package directory.
        const realOpendir = fs.opendirSync;
        const wanted = realpathSync(pack);
        let failures = 0;
        const spy = spyOn(fs, 'opendirSync');
        spy.mockImplementation(((path: fs.PathLike, options?: unknown) => {
            const handle = (realOpendir as (a: fs.PathLike, b?: unknown) => fs.Dir)(path, options);
            if (realpathSync(path) !== wanted) return handle;
            return new Proxy(handle, {
                get(target, key) {
                    if (key === 'readSync') {
                        return () => {
                            failures++;
                            throw Object.assign(new Error('synthetic read failure in a local fixture'), { code: 'EIO' });
                        };
                    }
                    const value = Reflect.get(target, key, target);
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });
        }) as typeof fs.opendirSync);
        let outcome: types.skills.FilesResult | null = null;
        let threw = false;
        try {
            outcome = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'review', action: 'list' });
        } catch {
            threw = true;
        } finally {
            spy.mockRestore();
        }
        expect(failures).toBeGreaterThan(0);
        expect(threw).toBe(false);
        if (!outcome) throw new Error('no result');
        // Either a typed refusal or an incomplete listing, never a rejected promise and never a claimed total.
        if (outcome.ok) {
            const incomplete = listed(outcome);
            expect(incomplete.truncated).toBe(true);
            expect(incomplete.packageBytes).toBeUndefined();
        } else {
            expect(outcome.reason.length).toBeLessThanOrEqual(limits.diagnosticChars);
            expect(outcome.reason).not.toContain(base);
        }
        // A healthy neighbour keeps working through the same reader.
        pkg(root, 'neighbour', manifest('neighbour'));
        const after = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'neighbour' });
        expect(after.ok).toBe(true);
    });

    test('bumps the resource count, entry count and depth budgets', async () => {
        const root = anchor('inventory-budgets');
        const pack = pkg(root, 'many', manifest('many'));
        writeFileSync(join(pack, 'SKILL.md'), manifest('many'), { mode: 0o600 });
        mkdirSync(join(pack, 'references'));
        for (const name of ['a.md', 'b.md', 'c.md', 'd.md']) writeFileSync(join(pack, 'references', name), name, { mode: 0o600 });
        mkdirSync(join(pack, 'references', 'deep'));
        writeFileSync(join(pack, 'references', 'deep', 'e.md'), 'e', { mode: 0o600 });
        const counted = listed(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'many', resourceLimit: 2 }));
        expect(counted.resources.length).toBe(2);
        expect(counted.truncated).toBe(true);
        // Dropping offered NAMES still counts every file, so the byte total stays proven.
        expect(counted.packageBytes).toBeGreaterThan(0);
        const entries = listed(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'many', entryLimit: 2 }));
        expect(entries.truncated).toBe(true);
        expect(entries.resources.length).toBeLessThan(5);
        const deep = listed(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'many', depthLimit: 1 }));
        expect(deep.resources.map(entry => entry.path)).not.toContain('references/deep/e.md');
        expect(deep.truncated).toBe(true);
        // A depth cut hides files, so the total is no longer provable and no number is offered.
        expect(deep.packageBytes).toBeUndefined();
        const raised = listed(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'many', resourceLimit: limits.resources + 1_000, entryLimit: limits.resourceEntries + 1_000 }));
        expect(raised.resources.map(entry => entry.path)).toEqual(['references/a.md', 'references/b.md', 'references/c.md', 'references/d.md', 'references/deep/e.md']);
        expect(raised.truncated).toBe(false);
        expect(raised.packageBytes).toBe(raised.resources.reduce((sum, entry) => sum + entry.bytes, 0) + raised.manifestBytes);
    });

    test('offers every listed resource back for reading, at any documented depth', async () => {
        const root = anchor('roundtrip');
        const pack = pkg(root, 'review');
        writeFileSync(join(pack, 'SKILL.md'), manifest('review'), { mode: 0o600 });
        const deepest = Array.from({ length: limits.depth }, (_, index) => `d${index}`).concat('note.md').join('/');
        const accepted = ['notes/basic.md'];
        // Spaces, non-ASCII and a leading dot are ordinary on disk but outside the reader's name grammar.
        const filtered = ['notes/release notes.md', 'notes/Résumé.md', 'notes/.hidden.md'];
        for (const path of accepted.concat(filtered, deepest)) {
            mkdirSync(join(pack, path, '..'), { recursive: true });
            writeFileSync(join(pack, path), `Note: ${path}\n`, { mode: 0o600 });
        }
        const inventory = listed(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'review' }));
        // A name the reader cannot accept is filtered out of the list, never offered and then refused.
        expect(inventory.resources.map(entry => entry.path).sort()).toEqual(accepted.concat(deepest).sort());
        expect(inventory.skipped).toBe(filtered.length);
        for (const path of inventory.resources.map(entry => entry.path)) {
            const page = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'review', action: 'read', path }));
            expect(page.bytes.toString('utf8')).toBe(`Note: ${path}\n`);
        }
        // One directory deeper than documented is outside the policy and refused on the argument.
        const deeper = Array.from({ length: limits.depth + 1 }, (_, index) => `d${index}`).concat('note.md').join('/');
        const beyond = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'review', action: 'read', path: deeper });
        expect(beyond.ok).toBe(false);
    });

    test('accepts a package of exactly the package limit and refuses one byte more in either action', async () => {
        const root = anchor('package-total');
        // Both names are the same length, so the two manifests weigh the same and only the blobs differ.
        // The extra byte goes in the LAST, still partial file, so every file stays inside its own limit.
        const note = 'A normal note.\n';
        const chunk = (name: string, extra: number): number[] => {
            const sizes: number[] = [];
            // The package total includes both the manifest and the ordinary note, so both are subtracted first.
            let remaining = limits.packageBytes - Buffer.byteLength(manifest(name)) - Buffer.byteLength(note);
            while (remaining > limits.resourceBytes) {
                sizes.push(limits.resourceBytes);
                remaining -= limits.resourceBytes;
            }
            sizes.push(remaining);
            sizes[sizes.length - 1] = sizes[sizes.length - 1]! + extra;
            return sizes;
        };
        const exactSizes = chunk('exact', 0);
        const overSizes = chunk('overr', 1);
        for (const frame of exactSizes.concat(overSizes)) expect(frame).toBeLessThanOrEqual(limits.resourceBytes);
        for (const [name, sizes] of [['exact', exactSizes], ['overr', overSizes]] as const) {
            const pack = pkg(root, name);
            writeFileSync(join(pack, 'SKILL.md'), manifest(name), { mode: 0o600 });
            mkdirSync(join(pack, 'assets'));
            writeFileSync(join(pack, 'note.txt'), note, { mode: 0o600 });
            sizes.forEach((size, position) => sparseFile(join(pack, 'assets', `blob-${position}.bin`), size));
        }
        const exact = listed(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'exact' }));
        expect(exact.packageBytes).toBe(limits.packageBytes);
        expect(exact.resources.length).toBe(exactSizes.length + 1);
        expect(paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'exact', action: 'read', path: 'note.txt' })).bytes.toString('utf8')).toBe(note);
        // One byte above the package limit: the inventory is refused, and so is a direct page of a small file.
        const overList = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'overr' });
        expect(overList.ok).toBe(false);
        if (!overList.ok) expect(overList.reason).toContain(String(limits.packageBytes));
        const overRead = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'overr', action: 'read', path: 'note.txt' });
        expect(overRead.ok).toBe(false);
        if (!overRead.ok) expect(overRead.reason).toContain(String(limits.packageBytes));
    });

    test('refuses a package without a regular SKILL.md', async () => {
        const root = anchor('missing-manifest');
        const pack = pkg(root, 'stray');
        writeFileSync(join(pack, 'notes.md'), 'x', { mode: 0o600 });
        const result = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'stray' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toContain('SKILL.md');
    });
});

describe('bounded resource reading', () => {
    test('pages a resource and stops at the documented page limit', async () => {
        const root = anchor('paging');
        const pack = pkg(root, 'pages', manifest('pages'));
        mkdirSync(join(pack, 'references'));
        sparseFile(join(pack, 'references', 'exact.bin'), limits.pageBytes);
        sparseFile(join(pack, 'references', 'plus.bin'), limits.pageBytes + 1);
        const exact = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'pages', action: 'read', path: 'references/exact.bin' }));
        expect(exact.bytes.length).toBe(limits.pageBytes);
        expect(exact.total).toBe(limits.pageBytes);
        expect(exact.nextOffset).toBe(limits.pageBytes);
        expect(exact.hasMore).toBe(false);
        const plus = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'pages', action: 'read', path: 'references/plus.bin' }));
        expect(plus.bytes.length).toBe(limits.pageBytes);
        expect(plus.hasMore).toBe(true);
        const rest = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'pages', action: 'read', path: 'references/plus.bin', offset: plus.nextOffset }));
        expect(rest.bytes.length).toBe(1);
        expect(rest.hasMore).toBe(false);
        // A caller cannot raise the page size beyond the documented limit.
        const raised = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'pages', action: 'read', path: 'references/plus.bin', pageLimit: limits.pageBytes * 2 }));
        expect(raised.bytes.length).toBe(limits.pageBytes);
    });

    test('accepts a resource of exactly the resource limit and rejects one byte more', async () => {
        const root = anchor('resource-size');
        const pack = pkg(root, 'sized', manifest('sized'));
        mkdirSync(join(pack, 'assets'));
        sparseFile(join(pack, 'assets', 'fits.bin'), limits.resourceBytes);
        sparseFile(join(pack, 'assets', 'over.bin'), limits.resourceBytes + 1);
        const fits = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'sized', action: 'read', path: 'assets/fits.bin' }));
        expect(fits.total).toBe(limits.resourceBytes);
        expect(fits.hasMore).toBe(true);
        const over = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'sized', action: 'read', path: 'assets/over.bin' });
        expect(over.ok).toBe(false);
        if (over.ok) return;
        expect(over.reason).toContain(String(limits.resourceBytes));
    });

    test('reads instructions up to the instruction limit only', async () => {
        const root = anchor('instructions');
        const pack = pkg(root, 'manual', manifest('manual'));
        sparseFile(join(pack, 'SKILL.md'), limits.instructionsBytes);
        const fits = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'manual', action: 'read', path: 'SKILL.md' }));
        expect(fits.total).toBe(limits.instructionsBytes);
        expect(fits.bytes.length).toBe(limits.pageBytes);
        sparseFile(join(pack, 'SKILL.md'), limits.instructionsBytes + 1);
        const over = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'manual', action: 'read', path: 'SKILL.md' });
        expect(over.ok).toBe(false);
        if (over.ok) return;
        expect(over.reason).toContain(String(limits.instructionsBytes));
    });

    test('returns the instructions of a portable package as exact bytes', async () => {
        const root = anchor('instructions-vendor');
        const text = manifest('vendor', 'license: MIT\n') + '\n# Vendor\n\nStep one.\n';
        const pack = pkg(root, 'vendor');
        writeFileSync(join(pack, 'SKILL.md'), text, { mode: 0o600 });
        const page = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'vendor', action: 'read', path: 'SKILL.md' }));
        expect(page.total).toBe(Buffer.byteLength(text));
        const whole = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'vendor', action: 'read', path: 'SKILL.md', pageLimit: Buffer.byteLength(text) }));
        const parsed = await ctx.fns.skills.parseManifest({ text: whole.bytes.toString('utf8'), directoryName: 'vendor' });
        if (!parsed.ok) throw new Error(parsed.reason);
        expect(parsed.manifest.license).toBe('MIT');
        expect(parsed.body).toBe('\n# Vendor\n\nStep one.\n');
    });

    test('rejects paths that escape the package, on the argument and on the filesystem', async () => {
        const root = anchor('traversal');
        const pack = pkg(root, 'strict', manifest('strict'));
        mkdirSync(join(pack, 'references'));
        writeFileSync(join(pack, 'references', 'ok.md'), 'ok\n', { mode: 0o600 });
        writeFileSync(join(root, 'sibling.txt'), 'sibling secret\n', { mode: 0o600 });
        symlinkSync(outside, join(pack, 'references', 'out'));
        symlinkSync(join(outside, 'secret.txt'), join(pack, 'references', 'escape.md'));
        for (const path of ['../sibling.txt', '/etc/passwd', 'references/../../sibling.txt', './references/ok.md', 'references//ok.md', 'references/', '', '.', '..']) {
            const result = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'strict', action: 'read', path });
            expect({ path, ok: result.ok }).toEqual({ path, ok: false });
            if (!result.ok) expect(result.reason).not.toContain('secret');
        }
        const throughLink = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'strict', action: 'read', path: 'references/escape.md' });
        expect(throughLink.ok).toBe(false);
        const throughDirLink = await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'strict', action: 'read', path: 'references/out/secret.txt' });
        expect(throughDirLink.ok).toBe(false);
        const nested = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'strict', action: 'read', path: 'references/ok.md' }));
        expect(nested.bytes.toString('utf8')).toBe('ok\n');
    });

    test('refuses a symlinked package name and an unnormalized anchor', async () => {
        const root = anchor('read-anchor');
        pkg(root, 'genuine', manifest('genuine'));
        symlinkSync(join(root, 'genuine'), join(root, 'shadow'));
        expect((await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'shadow' })).ok).toBe(false);
        expect((await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: '../outside' })).ok).toBe(false);
        expect((await ctx.fns.skills.packageFiles({ anchorDir: join(base, 'a', '..', 'b'), packageName: 'genuine' })).ok).toBe(false);
        expect((await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'genuine', action: 'read', path: 'SKILL.md' })).ok).toBe(true);
    });

    test('does not execute package content while listing or reading it', async () => {
        const root = anchor('inert');
        const pack = pkg(root, 'inert', manifest('inert'));
        const marker = join(base, 'executed.marker');
        mkdirSync(join(pack, 'scripts'));
        writeFileSync(join(pack, 'scripts', 'evil.ts'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n`, { mode: 0o600 });
        const list = listed(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'inert' }));
        const read = paged(await ctx.fns.skills.packageFiles({ anchorDir: root, packageName: 'inert', action: 'read', path: 'scripts/evil.ts' }));
        const scan = await ctx.fns.skills.packageScan({ anchorDir: root, sourceKind: 'workspace' });
        if (!scan.ok) throw new Error(scan.reason);
        expect(existsSync(marker)).toBe(false);
        expect(read.bytes.toString('utf8')).toContain('writeFileSync');
        expect(scan.packages.map(entry => entry.descriptor.name)).toEqual(['inert']);
    });
});
