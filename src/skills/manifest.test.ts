import { describe, expect, test } from 'bun:test';
import { testCtx } from '../$test';

// Skills helpers are pure analysis of text the caller already read, so no fixture
// touches the filesystem: every document below is the exact bytes a discovery
// adapter would hand to them. The two entry points are reached through the real
// registry so the test also proves the namespace and its signatures are mounted.

const DOC = [
    '---',
    'name: review',
    'description: Review the requested changes and report concrete findings.',
    'license: MIT',
    'compatibility: Requires a shell in the workspace.',
    'metadata:',
    '  author: team',
    '  audience: maintainers',
    'allowed-tools: Read Grep',
    '---',
    '',
    '# Review',
    '',
    'Step one: inspect the diff.   ',
    ''].join('\n');

describe('skills manifest', () => {
    test('reads a portable package without conversion', async () => {
        const ctx = await testCtx();
        const result = await ctx.fns.skills.parseManifest({ text: DOC, directoryName: 'review' });
        if (!result.ok) throw new Error(result.reason);
        expect(result.manifest).toEqual({
            name: 'review',
            description: 'Review the requested changes and report concrete findings.',
            license: 'MIT',
            compatibility: 'Requires a shell in the workspace.',
            metadata: { author: 'team', audience: 'maintainers' },
            'allowed-tools': 'Read Grep',
        });
        expect(result.body).toBe('\n# Review\n\nStep one: inspect the diff.   \n');
    });

    test('keeps literal metadata keys even when they match Object properties', async () => {
        const ctx = await testCtx();
        const text = DOC.replace('  author: team', '  __proto__: team\n  constructor: maintainers');
        const result = await ctx.fns.skills.parseManifest({ text, directoryName: 'review' });
        if (!result.ok) throw new Error(result.reason);
        expect(Object.entries(result.manifest.metadata!)).toContainEqual(['__proto__', 'team']);
        expect(Object.entries(result.manifest.metadata!)).toContainEqual(['constructor', 'maintainers']);
    });

    test('keeps the upstream single-string allowed-tools form', async () => {
        const ctx = await testCtx();
        const text = '---\nname: review\ndescription: Review changes.\nallowed-tools: Read Grep\n---\nBody\n';
        const result = await ctx.fns.skills.parseManifest({ text, directoryName: 'review' });
        if (!result.ok) throw new Error(result.reason);
        expect(result.manifest['allowed-tools']).toBe('Read Grep');
        expect(typeof result.manifest['allowed-tools']).toBe('string');
    });

    test('accepts CRLF and returns the body verbatim', async () => {
        const ctx = await testCtx();
        const text = DOC.replace(/\n/g, '\r\n');
        const result = await ctx.fns.skills.parseManifest({ text, directoryName: 'review' });
        if (!result.ok) throw new Error(result.reason);
        expect(result.manifest.name).toBe('review');
        expect(result.manifest.metadata).toEqual({ author: 'team', audience: 'maintainers' });
        expect(result.body).toBe('\r\n# Review\r\n\r\nStep one: inspect the diff.   \r\n');
    });

    test('accepts a digit-leading short name', async () => {
        const ctx = await testCtx();
        const text = '---\nname: 2fa-review\ndescription: Set up a second factor.\n---\nBody\n';
        const result = await ctx.fns.skills.parseManifest({ text, directoryName: '2fa-review' });
        if (!result.ok) throw new Error(result.reason);
        expect(result.manifest.name).toBe('2fa-review');
    });

    test('honours field length boundaries', async () => {
        const ctx = await testCtx();
        const doc = (name: string, description: string, compatibility?: string) => `---\nname: ${name}\ndescription: ${description}\n${compatibility === undefined ? '' : `compatibility: ${compatibility}\n`}---\nBody\n`;
        expect((await ctx.fns.skills.parseManifest({ text: doc('a'.repeat(64), 'x'), directoryName: 'a'.repeat(64) })).ok).toBe(true);
        expect((await ctx.fns.skills.parseManifest({ text: doc('a'.repeat(65), 'x'), directoryName: 'a'.repeat(65) })).ok).toBe(false);
        expect((await ctx.fns.skills.parseManifest({ text: doc('review', 'x'.repeat(1024)) })).ok).toBe(true);
        expect((await ctx.fns.skills.parseManifest({ text: doc('review', 'x'.repeat(1025)) })).ok).toBe(false);
        expect((await ctx.fns.skills.parseManifest({ text: doc('review', 'x', '""') })).ok).toBe(false);
        expect((await ctx.fns.skills.parseManifest({ text: doc('review', 'x', 'y'.repeat(500)) })).ok).toBe(true);
        expect((await ctx.fns.skills.parseManifest({ text: doc('review', 'x', 'y'.repeat(501)) })).ok).toBe(false);
    });

    test('rejects a document that does not begin with its frontmatter', async () => {
        const ctx = await testCtx();
        const result = await ctx.fns.skills.parseManifest({ text: 'Preamble text.\n' + DOC, directoryName: 'review' });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain('package review:');
        expect(result.reason).toContain('opening ---');
    });

    for (const [label, text, needle] of [
        ['an empty header', '---\n\n---\nBody\n', 'empty YAML frontmatter'],
        ['a malformed header', '---\nname: [unclosed\ndescription: d\n---\nBody\n', 'malformed YAML frontmatter'],
        ['a non-mapping header', '---\n- one\n- two\n---\nBody\n', 'expected a YAML mapping'],
        ['a missing description', '---\nname: review\n---\nBody\n', 'description is required'],
        ['a blank description', '---\nname: review\ndescription: "   "\n---\nBody\n', 'description is required'],
        ['a coerced number description', '---\nname: review\ndescription: 42\n---\nBody\n', 'description is required'],
        ['a coerced boolean name', '---\nname: true\ndescription: d\n---\nBody\n', 'name must be a string'],
        ['a doubled hyphen name', '---\nname: re--view\ndescription: d\n---\nBody\n', 'single hyphens'],
        ['a leading hyphen name', '---\nname: -review\ndescription: d\n---\nBody\n', 'single hyphens'],
        ['an uppercase name', '---\nname: Review\ndescription: d\n---\nBody\n', 'single hyphens'],
        ['a nested metadata value', '---\nname: review\ndescription: d\nmetadata:\n  owner:\n    team: a\n---\nBody\n', 'metadata.owner must be a string'],
        ['an array allowed-tools', '---\nname: review\ndescription: d\nallowed-tools:\n  - Read\n---\nBody\n', 'allowed-tools must be a string'],
        ['an unknown field', '---\nname: review\ndescription: d\nextra: 1\n---\nBody\n', 'unknown frontmatter field(s): extra'],
    ] as const) {
        test(`rejects ${label}`, async () => {
            const ctx = await testCtx();
            const result = await ctx.fns.skills.parseManifest({ text, directoryName: 'review' });
            expect(result.ok).toBe(false);
            if (result.ok) return;
            expect(result.reason).toContain('package review:');
            expect(result.reason).toContain(needle);
        });
    }

    test('localizes the failure to the offending package alone', async () => {
        const ctx = await testCtx();
        const broken = await ctx.fns.skills.parseManifest({ text: '---\nname: broken\ndescription: d\n---\nBody\n', directoryName: 'other' });
        const valid = await ctx.fns.skills.parseManifest({ text: DOC, directoryName: 'review' });
        expect(broken.ok).toBe(false);
        if (!broken.ok) expect(broken.reason).toContain('package other: name does not match the package directory name');
        expect(valid.ok).toBe(true);
    });
});

describe('skills qualified identity', () => {
    const NAME = 'review';
    const DESCRIPTION = 'Review the requested changes and report concrete findings.';

    test('builds the five canonical forms with their default labels', async () => {
        const ctx = await testCtx();
        const cases: [types.skills.Descriptor, Record<string, unknown>][] = [
            [{ id: 'skill.workspace:review', name: NAME, description: '', sourceKind: 'workspace', sourceLabel: 'Workspace' }, { sourceKind: 'workspace', name: NAME }],
            [{ id: 'skill.workspace.reviews:review', name: NAME, description: '', sourceKind: 'workspace', sourceLabel: 'Workspace · reviews', qualifier: 'reviews' }, { sourceKind: 'workspace', name: NAME, root: 'reviews' }],
            [{ id: 'skill.server.project:review', name: NAME, description: '', sourceKind: 'serverProject', sourceLabel: 'Server · project' }, { sourceKind: 'serverProject', name: NAME }],
            [{ id: 'skill.server.global:review', name: NAME, description: '', sourceKind: 'serverGlobal', sourceLabel: 'Server · global' }, { sourceKind: 'serverGlobal', name: NAME }],
            [{ id: 'skill.plugin.git:review', name: NAME, description: '', sourceKind: 'plugin', sourceLabel: 'Git', qualifier: 'git' }, { sourceKind: 'plugin', name: NAME, plugin: 'git' }],
        ];
        for (const [expected, opts] of cases) {
            const built = await ctx.fns.skills.qualifiedId(opts);
            if (!built.ok) throw new Error(opts.sourceKind + ': ' + built.reason);
            expect(built.id).toEqual(expected);
            expect(Object.keys(built.id).sort()).toEqual(Object.keys(expected).sort());
        }
    });

    test('uses the plugin display name from its trusted description', async () => {
        const ctx = await testCtx();
        const built = await ctx.fns.skills.qualifiedId({ sourceKind: 'plugin', name: NAME, plugin: 'git', pluginLabel: 'Git Tools' });
        if (!built.ok) throw new Error(built.reason);
        expect(built.id.id).toBe('skill.plugin.git:review');
        expect(built.id.sourceLabel).toBe('Git Tools');
        const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: built.id.id, pluginLabel: 'Git Tools' });
        if (!checked.ok) throw new Error(checked.reason);
        expect(checked.id).toEqual(built.id);
    });

    test('carries the description into the public descriptor only', async () => {
        const ctx = await testCtx();
        const built = await ctx.fns.skills.qualifiedId({ sourceKind: 'workspace', name: NAME, description: DESCRIPTION });
        if (!built.ok) throw new Error(built.reason);
        expect(built.id.description).toBe(DESCRIPTION);
        expect(Object.keys(built.id).sort()).toEqual(['description', 'id', 'name', 'sourceKind', 'sourceLabel']);
    });

    test('keeps identical short names from two plugins distinct', async () => {
        const ctx = await testCtx();
        const git = await ctx.fns.skills.qualifiedId({ sourceKind: 'plugin', name: NAME, plugin: 'git', pluginLabel: 'Git' });
        const checks = await ctx.fns.skills.qualifiedId({ sourceKind: 'plugin', name: NAME, plugin: 'checks', pluginLabel: 'Checks' });
        if (!git.ok || !checks.ok) throw new Error('both plugin exports must resolve');
        expect(git.id.id).toBe('skill.plugin.git:review');
        expect(checks.id.id).toBe('skill.plugin.checks:review');
        expect(git.id.qualifier).not.toBe(checks.id.qualifier);
    });

    test('round-trips every canonical form through the same grammar', async () => {
        const ctx = await testCtx();
        const builds = [
            { sourceKind: 'workspace' as const, name: NAME },
            { sourceKind: 'workspace' as const, name: NAME, root: 'team-tools' },
            { sourceKind: 'serverProject' as const, name: NAME },
            { sourceKind: 'serverGlobal' as const, name: NAME },
            { sourceKind: 'plugin' as const, name: NAME, plugin: 'git' },
        ];
        // Each form must survive a check of its own ID: build and check share one grammar.
        for (const opts of builds) {
            const built = await ctx.fns.skills.qualifiedId(opts);
            if (!built.ok) throw new Error(built.reason);
            const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: built.id.id });
            if (!checked.ok) throw new Error(built.id.id + ': ' + checked.reason);
            expect(checked.id).toEqual(built.id);
        }
    });

    test('honours the short-name boundary identically in build and check', async () => {
        const ctx = await testCtx();
        const name64 = 'a'.repeat(64);
        const built = await ctx.fns.skills.qualifiedId({ sourceKind: 'workspace', name: name64 });
        if (!built.ok) throw new Error(built.reason);
        expect(built.id.id).toBe(`skill.workspace:${name64}`);
        const checked = await ctx.fns.skills.qualifiedId({ action: 'check', id: built.id.id });
        if (!checked.ok) throw new Error(checked.reason);
        expect(checked.id.name).toBe(name64);
        expect((await ctx.fns.skills.qualifiedId({ sourceKind: 'workspace', name: 'a'.repeat(65) })).ok).toBe(false);
        expect((await ctx.fns.skills.qualifiedId({ action: 'check', id: `skill.workspace:${'a'.repeat(65)}` })).ok).toBe(false);
    });

    for (const [label, id] of [
        ['a missing prefix', 'commands.review:review'],
        ['a missing colon', 'skill.workspace'],
        ['an empty short name', 'skill.workspace:'],
        ['a second colon', 'skill.workspace.a:b:review'],
        ['a path separator', 'skill.workspace/review:review'],
        ['an unknown origin', 'skill.desktop:review'],
        ['a nested root qualifier', 'skill.workspace.a.b:review'],
        ['a trailing dot qualifier', 'skill.workspace.reviews.:review'],
        ['an empty plugin qualifier', 'skill.plugin.:review'],
        ['an uppercase short name', 'skill.workspace:Review'],
    ] as const) {
        test(`rejects ${label}`, async () => {
            const ctx = await testCtx();
            const result = await ctx.fns.skills.qualifiedId({ action: 'check', id });
            expect(result.ok).toBe(false);
        });
    }

    test('rejects malformed build inputs instead of rewriting them', async () => {
        const ctx = await testCtx();
        for (const opts of [
            { sourceKind: 'desktop', name: NAME },
            { sourceKind: 'workspace' },
            { sourceKind: 'workspace', name: 'Re--view' },
            { sourceKind: 'workspace', name: NAME, root: 'a.b' },
            { sourceKind: 'workspace', name: NAME, root: '' },
            { sourceKind: 'workspace', name: NAME, plugin: 'git' },
            { sourceKind: 'serverProject', name: NAME, root: 'team' },
            { sourceKind: 'serverGlobal', name: NAME, pluginLabel: 'Git' },
            { sourceKind: 'plugin', name: NAME, plugin: 'git', root: 'team' },
            { sourceKind: 'workspace', name: NAME, id: 'skill.server.global:review' },
            { action: 'check', id: 'skill.workspace:review', root: 'team' },
            { sourceKind: 'plugin', name: NAME },
            { sourceKind: 'plugin', name: NAME, plugin: 'git', pluginLabel: '   ' },
            { action: 'check' },
        ]) {
            expect((await ctx.fns.skills.qualifiedId(opts as never)).ok).toBe(false);
        }
    });
});

describe('skills public shape', () => {
    test('the catalogue grants Standard only the two skill readers', async () => {
        const ctx = await testCtx();
        const catalogue = ctx.fns.agentPreset.coreCatalogue({});
        expect(catalogue.skills).toEqual({ classification: 'standard', patterns: ['skills.list', 'skills.read'] });
        expect(catalogue.skill).toEqual({ classification: 'creator', patterns: [] });
    });
});
