import { expect, test } from 'vitest';
import { modelGroup, modelGroupKey, modelSourceLabel, parseModelRoute, selectableModels, unavailableGroups } from '../lib/models';
test('groups are labelled by provider and account, keeping the SSH host', () => {
  expect(modelGroup({ provider: 'codex', model: 'ssh/h:codex/me:gpt-6' })).toBe('h · codex · me');
  expect(modelGroup({ provider: 'claude', model: 'claude/work:claude-opus-5' })).toBe('claude · work');
  // A declared connection label replaces the parsed account under the same provider.
  expect(modelGroup({ provider: 'claude', model: 'claude/work:claude-opus-5', groupLabel: 'Work' })).toBe('claude · Work');
  // A route without an explicit account still names its provider instead of a bare default.
  expect(modelGroup({ provider: 'openai', model: 'openai:gpt-5' })).toBe('openai');
});
test('matching account names of different providers never share a heading', () => {
  expect(modelGroup({ provider: 'claude', model: 'claude/personal:x' })).toBe('claude · personal');
  expect(modelGroup({ provider: 'codex', model: 'codex/personal:x' })).toBe('codex · personal');
  expect(modelGroup({ provider: 'claude', model: 'claude/personal:x' })).not.toBe(modelGroup({ provider: 'codex', model: 'codex/personal:x' }));
  // Local and remote connections with the same provider and account stay apart as well.
  expect(modelGroup({ provider: 'codex', model: 'codex/personal:x' })).not.toBe(modelGroup({ provider: 'codex', model: 'ssh/h:codex/personal:x' }));
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
});
test('captions name the route provider, never a brand inferred from the model name', () => {
  expect(modelSourceLabel('ssh/h:codex/me:gpt-6')).toBe('h · codex · me');
  expect(modelSourceLabel('custom/vendor-gateway:anthropic/claude-opus-5')).toBe('custom · vendor-gateway');
  expect(modelSourceLabel('codex:gpt-6')).toBe('codex');
  expect(modelSourceLabel('')).toBe('');
});
test('selectable models drop disabled entries and models of disabled connections', () => {
  const settings = {
    models: [
      { provider: 'codex', model: 'codex/me:a', connectionId: 'on', disabled: false },
      { provider: 'codex', model: 'codex/me:b', connectionId: 'on', disabled: true },
      { provider: 'claude', model: 'claude/off:c', connectionId: 'off', disabled: false },
      { provider: 'claude', model: 'claude/detached:d', disabled: true },
    ],
    groups: [
      { connectionId: 'on', provider: 'codex', accountName: 'me', enabled: true, unavailable: false },
      { connectionId: 'off', provider: 'claude', accountName: 'off', enabled: false, unavailable: false },
    ],
  };
  expect(selectableModels(settings).map(option => option.model)).toEqual(['codex/me:a']);
});
test('unavailable notices cover enabled connections only', () => {
  const groups = [
    { connectionId: 'a', provider: 'codex', accountName: 'me', enabled: true, unavailable: true },
    { connectionId: 'b', provider: 'claude', accountName: 'off', enabled: false, unavailable: true },
    { connectionId: 'c', provider: 'claude', accountName: 'ok', enabled: true, unavailable: false },
  ];
  expect(unavailableGroups({ groups }).map(group => group.connectionId)).toEqual(['a']);
});
test('models of globally disabled providers are never offered and never appear as unavailable notices', () => {
  // The backend catalogue flags every model of a disabled provider disabled and its group enabled:false, unavailable:false.
  const settings = {
    models: [
      { provider: 'claude', model: 'claude/work:opus', connectionId: 'ok', disabled: false },
      { provider: 'codex', model: 'codex/me:a', connectionId: 'dead', disabled: true },
      { provider: 'codex', model: 'codex/me:b', connectionId: 'dead', disabled: true },
    ],
    groups: [
      { connectionId: 'ok', provider: 'claude', accountName: 'work', enabled: true, unavailable: false },
      { connectionId: 'dead', provider: 'codex', accountName: 'me', enabled: false, unavailable: false },
    ],
  };
  expect(selectableModels(settings).map(option => option.model)).toEqual(['claude/work:opus']);
  expect(unavailableGroups(settings)).toEqual([]);
  // Even a stale catalogue entry not yet flagged disabled is hidden by its disabled group.
  const stale = { ...settings, models: settings.models.map(m => ({ ...m, disabled: false })) };
  expect(selectableModels(stale).map(option => option.model)).toEqual(['claude/work:opus']);
});
