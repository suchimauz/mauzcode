import { expect, test } from 'bun:test';
import labels from './modelGroupLabels';

test('routes are labelled with their connection account name; unknown routes stay unlabelled', async () => {
    const ctx = { fns: { models: { list: async () => [
        { provider: 'claude', accountName: 'work' }, { provider: 'codex', accountName: 'me' },
    ] } } } as any;
    expect(await labels(ctx, null, { models: ['claude/work:claude-opus-5', 'codex/me:gpt-5:mini', 'claude/other:x', 'anthropic-oauth:opus'] }))
        .toEqual({ 'claude/work:claude-opus-5': 'work', 'codex/me:gpt-5:mini': 'me' });
});

test('connection storage failure is not hidden as missing labels', async () => {
    const ctx = { fns: { models: { list: async () => { throw Error('DB'); } } } } as any;
    await expect(labels(ctx, null, { models: ['claude/work:x'] })).rejects.toThrow('DB');
});
