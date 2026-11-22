import { describe, expect, test } from 'bun:test';
import summaryTemplate from './summaryTemplate';
import iconKeys from '../ui/iconKeys';
import summaryFormat from './summaryFormat';
import normalizePresentation from './normalizePresentation';
import redactArgs from './redactArgs';
import declaration from './declaration';
import presentation from './presentation';
import list from './list';

// Deliberately isolated from _testCtx: the resolver is pure over the registry.
function fakeCtx(tools: any[] = []) {
    const registry = new Map(tools.map(t => [t.key, t]));
    const ctx: any = { state: { tools: { registry } }, fns: {} };
    ctx.fns.ui = { iconKeys };
    ctx.fns.tools = {
        summaryTemplate: (o: any) => summaryTemplate(ctx, null, o),
        summaryFormat: (o: any) => summaryFormat(ctx, null, o),
        normalizePresentation: (o: any) => normalizePresentation(ctx, null, o),
        redactArgs: (o: any) => redactArgs(ctx, null, o),
        declaration: (o: any) => declaration(ctx, null, o),
        list: (o: any) => list(ctx, null, o),
    };
    return ctx;
}
const T = (template: string, args?: Record<string, unknown>) => summaryTemplate(null as any, null, { template, args });
const F = (formatter: string, args?: Record<string, unknown>) => summaryFormat(null as any, null, { formatter, args });

describe('summary templates', () => {
    test('placeholders, optional segments and alternatives', () => {
        expect(T('{path}[ · {status}]', { path: 'src/a.ts', status: 'open' })).toEqual({ ok: true, text: 'src/a.ts · open' });
        expect(T('{path}[ · {status}]', { path: 'src/a.ts' })).toEqual({ ok: true, text: 'src/a.ts' });
        expect(T('{note|first-line} || {id}', { id: 'c1', note: '' })).toEqual({ ok: true, text: 'c1' });
        expect(T('{note|first-line} || {id}', { id: 'c1', note: '\n  fixed it\nmore' })).toEqual({ ok: true, text: 'fixed it' });
        expect(T('{title} || {path}', {})).toEqual({ ok: true, text: '' });
        expect(T('{title}[ · {tasks|count} tasks]', { title: 'Inspect', tasks: [1, 2, 3] })).toEqual({ ok: true, text: 'Inspect · 3 tasks' });
        expect(T('{title}[ · {tasks|count} tasks]', { title: 'Inspect', tasks: [] })).toEqual({ ok: true, text: 'Inspect' });
        expect(T('{path|basename}', { path: 'a/b/c.ts' })).toEqual({ ok: true, text: 'c.ts' });
        expect(T('{id}[ @{offset}]', { id: 'r', offset: 4000 })).toEqual({ ok: true, text: 'r @4000' });
    });
    test('objects never render and no length cap applies', () => {
        expect(T('{spec}', { spec: { a: 1 } })).toEqual({ ok: true, text: '' });
        const long = 'x'.repeat(5000);
        expect(T('{text}', { text: long })).toEqual({ ok: true, text: long });
    });
    test('malformed templates are reported, not thrown', () => {
        for (const bad of ['{path', 'a]', '[a [b]]', '{a|upper}', '{a|first-line|count}', '{}', '[{a}', 'x}']) {
            expect(T(bad).ok).toBe(false);
        }
    });
});

describe('formatters', () => {
    test('@read', () => {
        expect(F('@read', { path: 'a.ts' })).toEqual({ ok: true, text: 'a.ts' });
        expect(F('@read', { path: 'a.ts', startLine: 10, endLine: 20, hashline: true })).toEqual({ ok: true, text: 'a.ts :10-20 #' });
        expect(F('@read', { path: 'a.ts', maxLines: 5 })).toEqual({ ok: true, text: 'a.ts :1+5' });
    });
    test('@edit, @search, @command, @code, @todos', () => {
        expect(F('@edit', { path: 'a.ts', edits: [{}, {}] })).toEqual({ ok: true, text: 'a.ts · 2 edits' });
        expect(F('@edit', { path: 'a.ts', edits: [{}] })).toEqual({ ok: true, text: 'a.ts · 1 edit' });
        expect(F('@search', { pattern: 'foo', path: 'src', glob: '*.ts' })).toEqual({ ok: true, text: 'foo in src (*.ts)' });
        expect(F('@search', { queries: ['one\nmore', 'two'], pattern: 'ignored' })).toEqual({ ok: true, text: 'one, two' });
        expect(F('@command', { command: 'git diff\ngit status' })).toEqual({ ok: true, text: 'git diff' });
        expect(F('@command', { command: 'git diff', description: 'Check changes' })).toEqual({ ok: true, text: 'Check changes' });
        expect(F('@code', { code: '\nconst a = 1;\nreturn a' })).toEqual({ ok: true, text: 'const a = 1;' });
        expect(F('@todos', { tasks: [1, 2, 3] })).toEqual({ ok: true, text: '3 tasks' });
        expect(F('@todos', { title: 'Plan', tasks: [1] })).toEqual({ ok: true, text: 'Plan' });
    });
    test('unknown formatter', () => {
        expect(F('@nope').ok).toBe(false);
    });
});

describe('normalizePresentation', () => {
    const N = (presentation: unknown) => normalizePresentation(fakeCtx(), null, { presentation });
    test('valid block passes unchanged', () => {
        expect(N({ label: 'Todos', icon: 'checklist', category: 'agent', summary: '@todos' })).toMatchObject({ presentation: { label: 'Todos', icon: 'checklist', category: 'agent', summary: '@todos' }, warnings: [] });
    });
    test('per-field fallback with warnings', () => {
        const r = N({ label: 'X', icon: 'rocket', category: 'space', summary: '{oops' });
        expect(r.presentation).toEqual({ label: 'X', icon: 'wrench', category: 'tools' });
        expect(r.warnings).toHaveLength(3);
        expect(N({ label: 'X', icon: 'file', summary: '@nope' }).warnings.join()).toContain('unknown formatter');
    });
    test('malformed block', () => {
        expect(N('nope')).toMatchObject({ presentation: null, warnings: [expect.stringContaining('must be an object')] });
        expect(N(undefined)).toMatchObject({ presentation: null, warnings: [] });
    });
});

describe('presentation resolver', () => {
    const bash = { key: 'tools.bash', name: 'bash', module: 'tools', presentation: { label: 'Bash', icon: 'terminal', category: 'commands', summary: '@command' }, parameters: { type: 'object', properties: { command: { type: 'string' }, env: { type: 'object' }, secrets: { type: 'object' } } } };
    const evalTool = { key: 'tools.eval', name: 'eval', module: 'tools', presentation: { label: 'Eval', icon: 'code', category: 'commands', summary: '@code' }, parameters: { type: 'object', properties: {} } };
    const review = { key: 'gitUi.gitReviewComments', name: 'gitReviewComments', module: 'gitUi', presentation: { label: 'Review comments', icon: 'comment', category: 'git', summary: '{path}[ · {status}]' }, parameters: { type: 'object', properties: {} } };
    const bad = { key: 'x.weird', name: 'weird', module: 'x', presentation: { label: 'Weird', icon: 'rocket', summary: '{broken' }, parameters: { type: 'object', properties: { token: { type: 'string', 'x-secret': true }, note: { type: 'string' } } } };
    const R = (name: string, args?: unknown, redact = false) => presentation(fakeCtx([bash, evalTool, review, bad]), null, { name, args, redactArgs: redact });

    test('declared tools, aliases and dotted names', () => {
        expect(R('bash', { command: 'bun test\nmore' })).toEqual({ label: 'Bash', icon: 'terminal', category: 'commands', summary: 'bun test' });
        expect(R('tools_eval', { code: 'return 1' })).toMatchObject({ label: 'Eval', icon: 'code', summary: 'return 1' });
        expect(R('tools.bash', { command: 'ls' })).toMatchObject({ label: 'Bash' });
        expect(R('gitReviewComments', { path: 'src/a.ts', status: 'open' }).summary).toBe('src/a.ts · open');
    });
    test('undeclared names get the wrench, raw name and safe fallback', () => {
        expect(R('removed.plugin_tool', { count: 3, spec: { a: 1 } })).toEqual({ label: 'removed.plugin_tool', icon: 'wrench', category: 'tools', summary: '' });
        expect(R('mystery', { html: '<b>x</b>', secrets: 'op://v/i', env: 'X', text: '\nfirst\nsecond' }).summary).toBe('first');
    });
    test('invalid fields fall back and x-secret is never a summary', () => {
        expect(R('weird', { token: 'tok', note: 'hello' })).toEqual({ label: 'Weird', icon: 'wrench', category: 'tools', summary: 'hello' });
    });
    test('redaction of secrets, env and x-secret', () => {
        const r = R('bash', { command: 'run', secrets: { TOKEN: 'secret://ns/name' }, env: { A: '1', B: '2' } }, true);
        expect(r.args).toEqual({ command: 'run', secrets: '••• (1 key)', env: '••• (2 keys)' });
        expect(JSON.stringify(r)).not.toContain('secret://');
        expect(R('weird', { token: 'tok', note: 'n' }, true).args).toEqual({ token: '•••', note: 'n' });
    });
    test('running and finished presentation are equal for the same call', () => {
        const args = { command: 'make\nall' };
        expect(R('bash', args)).toEqual(R('bash', JSON.parse(JSON.stringify(args))));
    });
});

describe('shipped declarations', () => {
    test('every core and official plugin native tool declares a valid, non-default presentation', async () => {
        const root = new URL('../..', import.meta.url).pathname;
        const files = [...new Bun.Glob('{src,plugins}/**/$tool_*.md').scanSync({ cwd: root })];
        expect(files.length).toBeGreaterThanOrEqual(22);
        for (const rel of files) {
            const text = await Bun.file(root + rel).text();
            const data: any = Bun.YAML.parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)![1]!);
            const name = rel.split('$tool_').pop()!.replace(/\.md$/, '');
            const checked = normalizePresentation(fakeCtx(), null, { presentation: data.presentation });
            expect({ rel, warnings: checked.warnings }).toEqual({ rel, warnings: [] });
            expect(checked.presentation?.icon).not.toBe('wrench');
            // Human words, not the identifier; single-word names may only be capitalised.
            expect(checked.presentation?.label).not.toBe(name);
            expect(checked.presentation?.label).not.toMatch(/[_]|[a-z][A-Z]/);
        }
    });
});
