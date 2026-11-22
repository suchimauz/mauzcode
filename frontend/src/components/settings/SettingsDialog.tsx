// Geometry follows the dsh settings modal (DeepSeek Harness, MIT); see THIRD_PARTY_NOTICES.md.
import { Dialog } from '@base-ui/react/dialog';
import { AudioLines, Bell, Boxes, Network, RefreshCw, Server, ShieldCheck, X } from 'lucide-react';
import { ModelsPanel } from './ModelsPanel';
import { VoicePanel } from './VoicePanel';
import { SshInstancesPanel } from './SshInstancesPanel';
import { AgentPresetsPanel } from './AgentPresetsPanel';
import { PushSettingsPanel } from './PushSettingsPanel';
import { UpdatesPanel } from './UpdatesPanel';
import { PluginSettingsTab } from './PluginSettingsTab';
import { PhosphorIcon } from '../mauzcode/PhosphorIcon';
import { usePluginUi } from '../../extensions/pluginRuntime';
import { SocksProxies } from '../../core-ui/socks-proxies';
import './settings.css';

export const SETTINGS_TABS = [{ id: 'models', label: 'Models', icon: Boxes }, { id: 'voice', label: 'Voice', icon: AudioLines }, { id: 'agent-presets', label: 'Agent presets', icon: ShieldCheck }, { id: 'ssh-instances', label: 'SSH Instances', icon: Server }, { id: 'push-notifications', label: 'Notifications', icon: Bell }, { id: 'updates', label: 'Updates', icon: RefreshCw }, { id: 'socks-proxies', label: 'SOCKS5', icon: Network }] as const;
/** A built-in tab id, or `plugin:<plugin>/<tab id>` for a granted plugin settings tab. */
export type SettingsTab = typeof SETTINGS_TABS[number]['id'] | `plugin:${string}`;
/** Settings tab id of a plugin settings tab registry key (`<plugin>/<id>`). */
export const pluginSettingsTab = (key: string): SettingsTab => `plugin:${key}`;

/**
 * Centered settings modal like dsh: mask + 800px panel, section list on the left,
 * close button in the content header. Escape, mask click and the close button close it.
 * Granted plugin settings tabs follow the built-in ones, each with the plugin's own title and icon; a tab whose plugin
 * is unloaded or no longer approved disappears and its content unmounts.
 */
export function SettingsDialog({ open, tab, onTab, onOpenChange, theme = 'light' }: { open: boolean; tab: SettingsTab; onTab: (tab: SettingsTab) => void; onOpenChange: (open: boolean) => void; theme?: 'light' | 'dark' }) {
  const { registry, loaded } = usePluginUi();
  const pluginTabs = registry.settingsTabs;
  const activePlugin = tab.startsWith('plugin:') ? pluginTabs.find(entry => pluginSettingsTab(entry.key) === tab) : undefined;
  const context = { agentId: null, theme, readOnly: false } as const;
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="settings-mask" />
      <Dialog.Popup className="settings-panel-modal" aria-describedby={undefined}>
        <nav className="settings-nav" aria-label="Разделы настроек">
          <Dialog.Title className="settings-nav-title">Settings</Dialog.Title>
          <div className="settings-nav-list">
            {SETTINGS_TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`settings-nav-cell ${tab === id ? 'is-active' : ''}`} aria-current={tab === id ? 'true' : undefined} onClick={() => onTab(id)}><Icon size={16} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span></button>)}
            {pluginTabs.length > 0 && <div className="settings-nav-divider" role="separator" aria-hidden="true" />}
            {pluginTabs.map(entry => { const id = pluginSettingsTab(entry.key); return <button key={id} type="button" className={`settings-nav-cell ${tab === id ? 'is-active' : ''}`} aria-current={tab === id ? 'true' : undefined} onClick={() => onTab(id)}><PhosphorIcon icon={entry.icon} size={16} /><span>{entry.title}</span></button>; })}
          </div>
          <select className="settings-nav-select settings-select" aria-label="Раздел настроек" value={tab} onChange={(event) => onTab(event.target.value as SettingsTab)}>
            {SETTINGS_TABS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            {pluginTabs.map(entry => <option key={entry.key} value={pluginSettingsTab(entry.key)}>{entry.title}</option>)}
            {tab.startsWith('plugin:') && !activePlugin && <option value={tab} disabled>—</option>}
          </select>
          <Dialog.Close className="settings-close settings-nav-close" aria-label="Закрыть настройки"><X size={16} strokeWidth={1.5} /></Dialog.Close>
        </nav>
        <div className="settings-content">
          <div className="settings-header" aria-hidden="true" />
          <div className="settings-options">{tab === 'push-notifications' && <PushSettingsPanel />}{tab === 'models' && <ModelsPanel context={{ agentId: null, theme, readOnly: false }} />}{tab === 'voice' && <VoicePanel />}{tab === 'agent-presets' && <AgentPresetsPanel />}{tab === 'ssh-instances' && <SshInstancesPanel onOpenConnections={() => onTab('models')} />}{tab === 'updates' && <UpdatesPanel />}{tab === 'socks-proxies' && <SocksProxies context={{ agentId: null, theme, readOnly: false }} />}{activePlugin && <PluginSettingsTab key={activePlugin.key} tab={activePlugin} context={context} />}{tab.startsWith('plugin:') && !activePlugin && <p className="settings-note" role="status">{loaded ? 'Этот раздел недоступен: плагин не загружен или его интерфейс не одобрен.' : 'Загрузка настроек плагина…'}</p>}</div>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
