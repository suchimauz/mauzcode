import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExtensionRegistry } from '../extensions/registry';
import type { ExtensionSettingsSectionProps, UiExtension } from '../extensions/types';

const pluginUi = vi.hoisted(() => ({ current: null as unknown, listeners: new Set<() => void>() }));
vi.mock('../extensions/pluginRuntime', async () => {
  const { useSyncExternalStore } = await import('react');
  return { usePluginUi: () => useSyncExternalStore(l => { pluginUi.listeners.add(l); return () => { pluginUi.listeners.delete(l); }; }, () => pluginUi.current) };
});

import { PluginSettingsPanel } from '../components/settings/PluginSettingsPanel';
import { SETTINGS_TABS, SettingsDialog } from '../components/settings/SettingsDialog';

const context = { agentId: null, theme: 'light' as const, readOnly: true };
const cleanup = vi.fn();
const seen: ExtensionSettingsSectionProps['context'][] = [];
function RtkSection({ context }: ExtensionSettingsSectionProps) {
  useEffect(() => { seen.push(context); return cleanup; }, [context]);
  return <p>RTK controls</p>;
}
const rtk: UiExtension = { id: 'rtk', apiVersion: 1, settingsSections: [{ id: 'shell', title: 'RTK shell output', description: 'Compress local bash output.', component: RtkSection }] };
const set = (extensions: UiExtension[], grants: Record<string, { settingsSections?: string[] }>, loaded = true) => {
  pluginUi.current = { registry: createExtensionRegistry(extensions, grants), applications: {}, errors: {}, loaded };
  for (const listener of [...pluginUi.listeners]) listener();
};
afterEach(() => { cleanup.mockClear(); seen.length = 0; });

describe('plugin settings sections', () => {
  it('registry exposes only granted, valid sections and keeps old extensions compatible', () => {
    expect(createExtensionRegistry([rtk], {}).settingsSections).toEqual([]);
    const granted = createExtensionRegistry([rtk], { rtk: { settingsSections: ['shell'] } });
    expect(granted.settingsSections.map(s => [s.key, s.extension])).toEqual([['rtk/shell', 'rtk']]);
    expect(Object.isFrozen(granted.settingsSections)).toBe(true);
    const old: UiExtension = { id: 'old', apiVersion: 1, pages: [{ id: 'main', title: 'Main', component: () => null }] };
    expect(createExtensionRegistry([old], { old: { pages: ['main'] } }).pages).toHaveLength(1);
    expect(() => createExtensionRegistry([{ ...rtk, settingsSections: [{ id: 'Bad id', title: 'x', component: RtkSection }] }], {})).toThrow(/Invalid settings section/);
    expect(() => createExtensionRegistry([{ ...rtk, settingsSections: [rtk.settingsSections![0], rtk.settingsSections![0]] }], {})).toThrow(/Invalid settings section/);
    expect(() => createExtensionRegistry([{ ...rtk, settingsSections: [{ id: 'shell', title: ' ', component: RtkSection }] }], {})).toThrow(/Invalid settings section/);
  });

  it('hosts a granted section with host context and accessible heading', () => {
    set([rtk], { rtk: { settingsSections: ['shell'] } });
    render(<PluginSettingsPanel context={context} />);
    expect(screen.getByRole('region', { name: 'RTK shell output' })).toBeVisible();
    expect(screen.getByText('RTK controls')).toBeVisible();
    expect(seen[0]).toEqual(context);
  });

  it('hides a section without its grant and shows an empty state', () => {
    set([rtk], {});
    render(<PluginSettingsPanel context={context} />);
    expect(screen.queryByText('RTK controls')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Нет плагинов с настройками');
  });

  it('unmounts and cleans up a section when the plugin is unloaded or its approval lapses', () => {
    set([rtk], { rtk: { settingsSections: ['shell'] } });
    render(<PluginSettingsPanel context={context} />);
    expect(screen.getByText('RTK controls')).toBeVisible();
    act(() => set([], {})); // manifest no longer lists the plugin (unloaded or unapproved)
    expect(screen.queryByText('RTK controls')).toBeNull();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('isolates a crashing section', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => { throw new Error('boom'); };
    set([{ id: 'bad', apiVersion: 1, settingsSections: [{ id: 'x', title: 'Broken', component: Broken }] }, rtk], { bad: { settingsSections: ['x'] }, rtk: { settingsSections: ['shell'] } });
    render(<PluginSettingsPanel context={context} />);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByText('RTK controls')).toBeVisible();
    spy.mockRestore();
  });

  it('is a tab of the Settings dialog', () => {
    expect(SETTINGS_TABS.map(t => t.id)).toContain('plugins');
    set([rtk], { rtk: { settingsSections: ['shell'] } });
    render(<SettingsDialog open tab="plugins" onTab={() => {}} onOpenChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Plugins' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('RTK controls')).toBeVisible();
  });
});
