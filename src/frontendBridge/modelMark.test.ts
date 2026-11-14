import { expect, test } from 'bun:test';
import modelLogo from '../ui/modelLogo';
import modelMark from './modelMark';
import declaredIcon from './declaredIcon';
import provider from '../../plugins/opencode-go/src/opencodeGo/$modelProvider_opencode-go';

const ctx = { fns: {
    procs: { ui: { escape: ({ text }: { text: string }) => text } },
    models: { providers: () => [provider, { id: 'another-plugin', icon: 'brand:opencode' }] },
    ui: { modelLogo: (opts: object) => modelLogo(ctx as never, null, opts) },
    frontendBridge: { declaredIcon: (opts: object) => declaredIcon(ctx as never, null, opts) },
} };
const mark = (model: string) => modelMark(ctx as never, null, { model });
const svg = (model: string) => modelLogo(ctx as never, null, { model, bare: true }).match(/<svg[\s\S]*?<\/svg>/)?.[0];

test('Go uses its declared OpenCode mark, as does any plugin declaring the same brand', async () => {
    const expected = await declaredIcon(ctx as never, null, { icon: 'brand:opencode' });
    expect(expected?.custom).toBe(false);
    expect(decodeURIComponent(expected!.src)).toContain('M16 6H8v12h8V6zm4 16H4V2h16v20z');
    expect(await modelMark(ctx as never, null, { provider: 'opencode-go' })).toEqual(expected);
    expect(await modelMark(ctx as never, null, { provider: 'another-plugin' })).toEqual(expected);
    for (const id of ['beam-free', 'iceman-contributor-free']) expect(await mark('opencode-go/Go:' + id)).toEqual(expected);
    expect(await mark('opencode-go/Go:claude-haiku-5-5')).not.toEqual(expected);
    expect(await declaredIcon(ctx as never, null, { icon: 'brand:missing-brand' })).toBeNull();
    expect(await declaredIcon(ctx as never, null, { icon: 'brand:opencode<script>' })).toBeNull();
});

test('new families match independently of gateway and remain distinct', async () => {
    const families = [
        ['hy3', 'hy4', 'hy4-preview', 'hunyuan-large'],
        ['mimo-v2.6-flash', 'mimo-v2.6-pro'],
        ['longcat-2.0', 'longcat-2.5-free'],
        ['step-5-preview', 'step-3'],
        ['muse-spark-1.2-contributor', 'muse-spark-1.3-contributor'],
    ];
    const marks = new Set<string>();
    for (const family of families) {
        const reference = svg('custom/gateway:' + family[0]);
        expect(reference).toBeDefined();
        marks.add(reference!);
        for (const id of family) {
            expect(svg('opencode-go/Go:' + id)).toBe(reference);
            expect(svg('custom/gateway:vendor/' + id)).toBe(reference);
            expect(svg('mauzcode/node:custom/gateway:' + id)).toBe(reference);
            const result = await mark('opencode-go/Go:' + id);
            expect(result?.custom).toBe(false); // React mask, foreground in either theme.
            const image = decodeURIComponent(result!.src);
            expect(image).toContain('fill="currentColor"');
            expect(image).toContain('viewBox="0 0 24 24"');
            expect(image).not.toMatch(/<(?:script|image|foreignObject|style)|\bon\w+=|href=|url\(/i);
        }
    }
    expect(marks.size).toBe(5);
    for (const id of ['hy35', 'hy4ish', 'mimosa', 'step-back', 'longcatapult', 'muse-other', 'beam-free', 'iceman-contributor-free']) expect(svg('custom/gateway:' + id)).toBeUndefined();
});
