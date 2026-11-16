import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentPresetsPanel } from '../components/settings/AgentPresetsPanel';
import { SETTINGS_TABS } from '../components/settings/SettingsDialog';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const preset = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), description: `${id} preset`, sortOrder: 0, builtin: true, allow: [], deny: [], plugins: [], excludeSections: [], prompt: '', updatedAt: 1_700_000_000_000, ...extra });
const body = (defaultPresetId = 'standard', presets = [preset('standard', { allow: ['files.*', 'git.*'], plugins: ['git'], prompt: 'Be careful.\n  Indented.' }), preset('creator', { sortOrder: 1, allow: ['*'], plugins: ['*'] }), preset('team', { builtin: false, deny: ['bash'] })]) =>
  ({ version: 1, presets, defaultPresetId, defaultPresetMissing: !presets.some(p => p.id === defaultPresetId) });
function mock(...responses: Response[]) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => responses.shift() ?? json(body()));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const card = (name: string) => screen.getByRole('region', { name });

afterEach(() => { vi.unstubAllGlobals(); });

it('registers the Agent presets tab', () => {
  expect(SETTINGS_TABS.find(t => t.id === 'agent-presets')?.label).toBe('Agent presets');
});

it('renders presets with badges, default marker, rule lists and prompt', async () => {
  const fetch = mock(json(body()));
  render(<AgentPresetsPanel />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  const standard = await screen.findByRole('region', { name: 'Standard' });
  expect(fetch.mock.calls[0]![0]).toBe('/ui-lab-api/agent-presets');
  expect(within(standard).getByText('Built-in')).toBeVisible();
  expect(within(standard).getByText('Default for new sessions')).toBeVisible();
  expect(within(standard).getByRole('list', { name: 'Allow' })).toHaveTextContent('files.*git.*');
  expect(within(standard).getByRole('list', { name: 'Plugins' })).toHaveTextContent('git');
  expect(within(standard).getByText(/Be careful\./).textContent).toBe('Be careful.\n  Indented.');
  const creator = card('Creator');
  expect(within(creator).queryByText('Default for new sessions')).toBeNull();
  expect(within(creator).getByRole('list', { name: 'Allow' })).toHaveTextContent('*everything');
  expect(within(creator).getByRole('list', { name: 'Plugins' })).toHaveTextContent('*everything');
  expect(within(creator).getAllByText('none')).toHaveLength(3); // deny, excluded sections, prompt
  expect(within(card('Team')).getByText('Custom')).toBeVisible();
  expect(screen.getByText(/apply only to new agents/)).toHaveTextContent('guardrail, not a sandbox');
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});

it('warns about a missing default and marks no preset', async () => {
  mock(json(body('ghost')));
  render(<AgentPresetsPanel />);
  expect(await screen.findByRole('alert')).toHaveTextContent('ghost');
  expect(screen.getByRole('alert')).toHaveTextContent('cannot be created');
  for (const name of ['Standard', 'Creator', 'Team']) expect(card(name)).toBeVisible();
  expect(screen.queryByText('Default for new sessions')).toBeNull();
});

it('shows the empty state', async () => {
  mock(json(body('standard', [])));
  render(<AgentPresetsPanel />);
  expect(await screen.findByText('No agent presets are stored.')).toBeVisible();
});

it('shows an error and retries', async () => {
  const fetch = mock(json({ error: 'Only owners can view agent presets' }, 403), json(body()));
  render(<AgentPresetsPanel />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Only owners');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('region', { name: 'Standard' })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});
