import { ExtensionBoundary } from '../../extensions/ExtensionHost';
import type { ExtensionContext, RegisteredSettingsTab } from '../../extensions/types';

/**
 * Content of one plugin-owned Settings tab. The host owns the heading and error isolation; callers key it by the
 * registry entry, so a plugin unload, bundle change or lapsed approval unmounts it and runs its cleanup.
 * Visibility and readOnly never authorize writes; each plugin endpoint enforces owner access and CSRF itself.
 */
export function PluginSettingsTab({ tab, context }: { tab: RegisteredSettingsTab; context: ExtensionContext }) {
  const View = tab.component;
  return <section className="settings-panel" aria-label={tab.title}>
    <header className="settings-panel-header"><h2>{tab.title}</h2>{tab.description && <p>{tab.description}</p>}</header>
    <ExtensionBoundary><View context={context} /></ExtensionBoundary>
  </section>;
}
