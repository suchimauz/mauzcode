import { afterEach, describe, expect, it } from 'vitest';
import { clearNewSessionDraft, hasRemovedSessionFields, persistNewSessionDraft, submitNewSession, type NewSessionDraft, readNewSessionDraft, readSessionSelection, rememberSessionSelection, resolveNewSessionProject } from '../lib/newSession';

afterEach(() => { localStorage.clear(); sessionStorage.clear(); });
describe('new session preferences', () => {
  it('remembers the last visited project and explicitly selected model independently', () => {
    rememberSessionSelection({ projectId: 'first', model: 'provider:model' });
    rememberSessionSelection({ projectId: 'last' });
    expect(readSessionSelection()).toEqual({ projectId: 'last', model: 'provider:model' });
    expect(readNewSessionDraft()).toMatchObject({ projectId: 'last', model: 'provider:model', text: '', effort: '' });
  });
  it('keeps an unfinished draft and retains preferences after its successful creation', () => {
    rememberSessionSelection({ projectId: 'last', model: 'provider:last' });
    const draft = { ...readNewSessionDraft(), text: 'Unsent', model: 'provider:draft' };
    persistNewSessionDraft(draft); expect(readNewSessionDraft()).toEqual(draft);
    clearNewSessionDraft(); expect(readNewSessionDraft()).toMatchObject({ text: '', model: 'provider:last', projectId: 'last' });
  });
  it('uses available preferred workspace or the first active real workspace', () => {
    const projects = [{ id: 'archived', archived: true }, { id: 'virtual', virtual: true }, { id: 'first' }, { id: 'last' }];
    expect(resolveNewSessionProject(projects, 'last')).toBe('last');
    for (const unavailable of ['archived', 'virtual', 'deleted', undefined]) expect(resolveNewSessionProject(projects, unavailable)).toBe('first');
    expect(resolveNewSessionProject([], 'last')).toBe('');
  });
  it('ignores malformed stored values', () => {
    localStorage.setItem('mauzcode-ui-last-session-selection', '{broken'); expect(readSessionSelection()).toEqual({});
    localStorage.setItem('mauzcode-ui-last-session-selection', JSON.stringify({ model: {}, projectId: 5 })); expect(readSessionSelection()).toEqual({});
    sessionStorage.setItem('mauzcode-ui-new-session', '{broken'); expect(readNewSessionDraft().text).toBe('');
  });
});
it('explicit creation links keep the title and ignore removed advanced fields', () => {
  history.replaceState(null, '', '/?newSession=1&agent=old&title=Named&workspaceDir=%2Ftmp%2Fwork&promptPreset=review-mode&systemPrompt=Extra');
  const draft = readNewSessionDraft();
  expect(draft.title).toBe('Named');
  for (const key of ['workspaceDir', 'createWorkspaceDir', 'promptPreset', 'systemPrompt']) expect(draft).not.toHaveProperty(key);
  history.replaceState(null, '', '/');
});
it('a legacy stored draft with removed fields loads and drops them', () => {
  sessionStorage.setItem('mauzcode-ui-new-session', JSON.stringify({ title: 'Old', workspaceDir: '/tmp/x', createWorkspaceDir: '1', promptPreset: ['review-mode'], systemPrompt: 'Extra', projectId: 'p', model: 'm', effort: '', text: 'Hi', requestKey: 'k' }));
  expect(readNewSessionDraft()).toEqual({ title: 'Old', mascot: 'random', projectId: 'p', model: 'm', effort: '', text: 'Hi', requestKey: 'k' });
});
it('detects removed fields only when they carry a value', () => {
  expect(hasRemovedSessionFields({ workspaceDir: '', promptPreset: [], systemPrompt: '' })).toBe(false);
  expect(hasRemovedSessionFields({ promptPreset: ['review-mode'] })).toBe(true);
  expect(hasRemovedSessionFields({ workspaceDir: '/tmp' })).toBe(true);
});
it('submit bodies carry only the trimmed title among old advanced fields', async () => {
  const { vi } = await import('vitest');
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ agentId: 'a', projectId: 'p', status: 'sent' }), { status: 201, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetcher);
  const legacy = { title: '  Named  ', workspaceDir: '/tmp/x', promptPreset: ['r'], systemPrompt: 'S', projectId: 'p', model: 'm', effort: '', text: ' hi ', requestKey: 'request-key-00001' } as NewSessionDraft;
  await submitNewSession(legacy, 'token');
  const json = JSON.parse(String(fetcher.mock.calls[0][1].body));
  expect(json).toMatchObject({ title: 'Named', projectId: 'p', text: 'hi' });
  for (const key of ['workspaceDir', 'createWorkspaceDir', 'promptPreset', 'systemPrompt']) expect(json).not.toHaveProperty(key);
  await submitNewSession(legacy, 'token', [new File(['x'], 'a.txt')]);
  const form = fetcher.mock.calls[1][1].body as FormData;
  expect(form.get('title')).toBe('Named'); expect(form.get('projectId')).toBe('p');
  for (const key of ['workspaceDir', 'createWorkspaceDir', 'promptPreset', 'systemPrompt']) expect(form.has(key)).toBe(false);
  vi.unstubAllGlobals();
});
