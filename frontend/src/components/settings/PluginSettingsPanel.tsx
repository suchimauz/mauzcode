import { ExtensionBoundary } from '../../extensions/ExtensionHost';
import { usePluginUi } from '../../extensions/pluginRuntime';
import type { ExtensionContext, RegisteredSettingsSection } from '../../extensions/types';

/** One granted plugin section. The host owns the heading and error isolation; the key ties the mounted
 * component to its registry entry, so a plugin unload or bundle change unmounts it and runs its cleanup. */
function Section({ section, context }: { section: RegisteredSettingsSection; context: ExtensionContext }) {
  const View = section.component;
  const headingId = `plugin-settings-${section.key.replace(/[^a-z0-9-]/g, '-')}`;
  return <section className="plugin-settings-section" aria-labelledby={headingId}>
    <header className="plugin-settings-section-header">
      <h3 id={headingId} className="plugin-settings-section-title">{section.title}</h3>
      {section.description && <p className="settings-note">{section.description}</p>}
    </header>
    <ExtensionBoundary><View context={context} /></ExtensionBoundary>
  </section>;
}

/**
 * Host-owned Plugin Settings page: renders only settings sections granted to eligible (loaded, approved) plugin UIs.
 * Visibility and readOnly never authorize writes; each plugin endpoint enforces owner access and CSRF itself.
 */
export function PluginSettingsPanel({ context }: { context: ExtensionContext }) {
  const { registry, loaded } = usePluginUi();
  const sections = registry.settingsSections;
  return <section className="settings-panel" aria-label="Plugins">
    <header className="settings-panel-header"><h2>Plugins</h2><p>Настройки, которые предоставляют загруженные плагины.</p></header>
    {!loaded && <p className="settings-note" role="status">Загрузка настроек плагинов…</p>}
    {loaded && sections.length === 0 && <p className="settings-note" role="status">Нет плагинов с настройками.</p>}
    {sections.map(section => <Section key={section.key} section={section} context={context} />)}
  </section>;
}
