import { expect, test } from 'vitest';
import { modelGroup, modelGroupKey, modelSourceLabel, parseModelRoute } from '../lib/models';
test('groups are labelled by account name, never by provider', () => {
  expect(modelGroup({ provider: 'ssh/h', model: 'ssh/h:codex/me:gpt-6' })).toBe('h · me');
  expect(modelGroup({ provider: 'claude', model: 'claude/work:claude-opus-5' })).toBe('work');
  expect(modelGroup({ provider: 'claude', model: 'claude/work:claude-opus-5', groupLabel: 'Work' })).toBe('Work');
});
test('group identity is the connection id, so equal account names of different providers stay apart', () => {
  expect(modelGroupKey({ provider: 'claude', model: 'claude/team:x', connectionId: 'c1' })).toBe('c1');
  expect(modelGroupKey({ provider: 'claude', model: 'claude/team:x' })).not.toBe(modelGroupKey({ provider: 'codex', model: 'codex/team:y' }));
});
test('routes parse onto provider/account:model with dots and spaces in account names', () => {
  expect(parseModelRoute('openai:gpt-5').route).toBe('openai/default:gpt-5');
  expect(parseModelRoute('claude/my team:opus')).toMatchObject({ provider: 'claude', account: 'my team', model: 'opus' });
  expect(parseModelRoute('codex/me:gpt-5:mini')).toMatchObject({ account: 'me', model: 'gpt-5:mini' });
  expect(parseModelRoute('ssh/h:codex/me:gpt-6')).toMatchObject({ host: 'h', provider: 'codex', account: 'me', model: 'gpt-6' });
  expect(modelSourceLabel('ssh/h:codex/me:gpt-6')).toBe('codex · me');
});
