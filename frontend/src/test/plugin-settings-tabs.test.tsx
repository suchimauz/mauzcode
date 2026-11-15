import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExtensionRegistry } from '../extensions/registry';
import type { ExtensionSettingsTabProps, UiExtension } from '../extensions/types';

const pluginUi = vi.hoisted(() => ({ current: null as unknown, listeners: new Set<() => void>() }));
vi.mock('../extensions/pluginRuntime', async () => {
  const { useSyncExternalStore } = await import('react');
  return { usePluginUi: () => useSyncExternalStore(l => { pluginUi.listeners.add(l); return () => { pluginUi.listeners.delete(l); }; }, () => pluginUi.current) };
});

import { SETTINGS_TABS, SettingsDialog, type SettingsTab } from '../components/settings/SettingsDialog';

const context = { agentId: null, theme: 'light' as const, readOnly: false };
const cleanup = vi.fn();
const seen: ExtensionSettingsTabProps['context'][] = [];
function RtkSection({ context }: ExtensionSettingsTabProps) {
  useEffect(() => { seen.push(context); return cleanup; }, [context]);
  return <p>RTK controls</p>;
}
const rtk: UiExtension = { id: 'rtk', apiVersion: 1, settingsTabs: [{ id: 'shell', title: 'RTK shell output', description: 'Compress local bash output.', component: RtkSection }] };
const set = (extensions: UiExtension[], grants: Record<string, { settingsTabs?: string[] }>, loaded = true, icons: Record<string, string | null> = { rtk: 'ph-arrows-in' }) => {
  pluginUi.current = { registry: createExtensionRegistry(extensions, grants, icons), applications: {}, errors: {}, loaded };
  for (const listener of [...pluginUi.listeners]) listener();
};
afterEach(() => { cleanup.mockClear(); seen.length = 0; });

const dialog = (tab: SettingsTab, onTab: (tab: SettingsTab) => void = () => {}) => render(<SettingsDialog open tab={tab} onTab={onTab} onOpenChange={() => {}} />);

describe('plugin settings tabs', () => {
  it('registry exposes only granted, valid tabs with the plugin icon and keeps old extensions compatible', () => {
    expect(createExtensionRegistry([rtk], {}).settingsTabs).toEqual([]);
    const granted = createExtensionRegistry([rtk], { rtk: { settingsTabs: ['shell'] } }, { rtk: 'ph-arrows-in' });
    expect(granted.settingsTabs.map(s => [s.key, s.extension, s.icon])).toEqual([['rtk/shell', 'rtk', 'ph-arrows-in']]);
    expect(createExtensionRegistry([rtk], { rtk: { settingsTabs: ['shell'] } }, { rtk: 'not-an-icon' }).settingsTabs[0]?.icon).toBeNull();
    expect(Object.isFrozen(granted.settingsTabs)).toBe(true);
    const old: UiExtension = { id: 'old', apiVersion: 1, pages: [{ id: 'main', title: 'Main', component: () => null }] };
    expect(createExtensionRegistry([old], { old: { pages: ['main'] } }).pages).toHaveLength(1);
    expect(() => createExtensionRegistry([{ ...rtk, settingsTabs: [{ id: 'Bad id', title: 'x', component: RtkSection }] }], {})).toThrow(/Invalid settings tab/);
    expect(() => createExtensionRegistry([{ ...rtk, settingsTabs: [rtk.settingsTabs![0], rtk.settingsTabs![0]] }], {})).toThrow(/Invalid settings tab/);
    expect(() => createExtensionRegistry([{ ...rtk, settingsTabs: [{ id: 'shell', title: ' ', component: RtkSection }] }], {})).toThrow(/Invalid settings tab/);
  });

  it('adds a separate dialog tab named by the plugin, after the built-in tabs, with no shared Plugins tab', () => {
    expect(SETTINGS_TABS.map(t => t.id)).not.toContain('plugins');
    set([rtk], { rtk: { settingsTabs: ['shell'] } });
    const onTab = vi.fn();
    const view = dialog('models', onTab);
    const nav = screen.getAllByRole('button').filter(b => b.classList.contains('settings-nav-cell')).map(b => b.textContent);
    expect(nav.at(-1)).toBe('RTK shell output');
    expect(nav).not.toContain('Plugins');
    const button = screen.getByRole('button', { name: 'RTK shell output' });
    expect(button.querySelector('i.ph.ph-arrows-in')).not.toBeNull();
    fireEvent.click(button);
    expect(onTab).toHaveBeenCalledWith('plugin:rtk/shell');
    expect(screen.queryByText('RTK controls')).toBeNull();
    view.unmount();
  });

  it('renders the tab content with host context, heading and description', () => {
    set([rtk], { rtk: { settingsTabs: ['shell'] } });
    dialog('plugin:rtk/shell');
    expect(screen.getByRole('button', { name: 'RTK shell output' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('region', { name: 'RTK shell output' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'RTK shell output' })).toBeVisible();
    expect(screen.getByText('Compress local bash output.')).toBeVisible();
    expect(screen.getByText('RTK controls')).toBeVisible();
    expect(seen[0]).toEqual(context);
  });

  it('falls back to the puzzle icon without a valid plugin icon', () => {
    set([rtk], { rtk: { settingsTabs: ['shell'] } }, true, {});
    dialog('models');
    const button = screen.getByRole('button', { name: 'RTK shell output' });
    expect(button.querySelector('i.ph')).toBeNull();
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('hides a tab without its grant', () => {
    set([rtk], {});
    dialog('models');
    expect(screen.queryByRole('button', { name: 'RTK shell output' })).toBeNull();
  });

  it('unmounts and cleans up the tab when the plugin is unloaded or its approval lapses', () => {
    set([rtk], { rtk: { settingsTabs: ['shell'] } });
    dialog('plugin:rtk/shell');
    expect(screen.getByText('RTK controls')).toBeVisible();
    act(() => set([], {})); // manifest no longer lists the plugin (unloaded or unapproved)
    expect(screen.queryByText('RTK controls')).toBeNull();
    expect(screen.queryByRole('button', { name: 'RTK shell output' })).toBeNull();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('плагин не загружен');
  });

  it('shows loading for a linked plugin tab before plugin UIs load', () => {
    set([], {}, false);
    dialog('plugin:rtk/shell');
    expect(screen.getByRole('status')).toHaveTextContent('Загрузка');
  });

  it('isolates a crashing tab', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => { throw new Error('boom'); };
    set([{ id: 'bad', apiVersion: 1, settingsTabs: [{ id: 'x', title: 'Broken', component: Broken }] }, rtk], { bad: { settingsTabs: ['x'] }, rtk: { settingsTabs: ['shell'] } });
    dialog('plugin:bad/x');
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'RTK shell output' })).toBeVisible();
    spy.mockRestore();
  });
});
