import type { ComponentType } from 'react';

/** Host-owned identity. Visibility is not authorization: endpoints must check access again. */
export type ExtensionContext = Readonly<{ agentId: string | null; theme: 'light' | 'dark'; readOnly: boolean }>;
export type ExtensionViewProps = { context: ExtensionContext };
export type ExtensionCanvasProps = ExtensionViewProps & { item: Readonly<{ id: number; kind: string; args: Record<string, unknown>; state: Record<string, unknown> }> };
/** Safe server-projected input metadata; never contains completion capabilities or secrets. */
export type ExtensionInput = Readonly<{ id: string; kind: string; title: string; message?: string; spec?: Record<string, unknown>; state?: string }>;
/** onDone only refreshes authoritative server state; it never approves or completes an input. */
export type ExtensionInputProps = ExtensionViewProps & { input: ExtensionInput; onDone: () => void };
/** Controlled collection-only editor. The batch host owns navigation and atomic completion. Never submit from this component. */
export type ExtensionBatchInputProps = ExtensionViewProps & { input: ExtensionInput; step: { key: string; index: number; count: number }; draft: Record<string, string | string[]>; onChange: (draft: Record<string, string | string[]>) => void; error?: string; busy?: boolean; readOnly?: boolean };
export type ExtensionInputKind = { kind: string; component: ComponentType<ExtensionInputProps>; batchComponent?: ComponentType<ExtensionBatchInputProps> };
export type ExtensionCanvasKind = { kind: string; component: ComponentType<ExtensionCanvasProps> };
/** Props of a Start-page launcher tab: a local browser tab, unmounted when closed. */
export type ExtensionLauncherProps = ExtensionViewProps & { tabId: string; active: boolean };
/** A button on the Canvas Start page that opens a local tab with `component`.
 * `icon` is a Phosphor class (e.g. "ph-terminal-window"); omitted, the plugin's own procs.icon is used. */
export type ExtensionCanvasLauncher = { id: string; title: string; description?: string; icon?: string } & (
  | { component: ComponentType<ExtensionLauncherProps>; open?: never }
  /** One-step launcher: the Start page calls `open` directly and selects the returned server Canvas item, with no local tab. */
  | { open: (context: ExtensionContext) => Promise<{ id: number }>; component?: never }
);
/** Secret-free provider catalogue entry served by GET /models/api. */
export type ModelProviderView = Readonly<{ id: string; label: string; description?: string; icon?: string; fields: readonly ModelFieldSpec[]; transports: readonly ModelTransportSpec['kind'][]; actions: readonly { name: string; label: string }[] }>;
export type ModelFieldSpec = { key: string; label: string; required?: boolean; help?: string; placeholder?: string } & (
  | { type: 'text' | 'url'; default?: string }
  | { type: 'select'; default?: string; options: readonly { value: string; label: string }[] }
  | { type: 'secret'; default?: never }
  | { type: 'number'; default?: number }
  | { type: 'boolean'; default?: boolean }
);
export type ModelTransportSpec = { kind: 'direct' } | { kind: 'socks'; proxyId: string } | { kind: 'ssh-tunnel'; instance: string };
/** Secret-free connection: `secrets` maps a secret field key to whether a value is stored, never the value. */
export type ModelConnectionView = Readonly<{ id: string; provider: string; providerRegistered: boolean; accountName: string; config: Readonly<Record<string, unknown>>; secrets: Readonly<Record<string, boolean>>; transport: ModelTransportSpec; enabled: boolean; disabledModels?: readonly string[]; createdAt: number; updatedAt: number }>;
/** Props of a plugin-owned connection form. The component saves through the owner-only /models/api with the CSRF token
 * (SDK requestJson) and then calls onSaved; it never receives secret values. */
export type ExtensionModelProviderProps = ExtensionViewProps & { provider: ModelProviderView; connection?: ModelConnectionView; onSaved: (connection: ModelConnectionView) => void; onCancel: () => void };
/** Connection form for one provider id; requires a modelProviders grant for that id. */
export type ExtensionModelProvider = { provider: string; component: ComponentType<ExtensionModelProviderProps> };
/** Compact durable reference of a sent Git review; identities only, never comment content. */
export type ExtensionReviewReference = Readonly<{ version: 1; host: string; dir: string; count: number; ids: readonly string[] }>;
/** Expanded details of a structured chat card. The host owns the card header, grouping and disclosure; the component
 * fetches live details through the plugin's own authorized endpoint and must never append them to the transcript. */
export type ExtensionChatCardProps = ExtensionViewProps & { eventIdx: number; reference: ExtensionReviewReference };
/** Detail renderer for a host-classified chat card kind (`git.review`); requires a chatCards grant. */
export type ExtensionChatCard = { kind: string; component: ComponentType<ExtensionChatCardProps> };
/** Props of a plugin-owned Settings tab. The host owns the navigation entry, heading, icon and lifecycle; visibility and
 * readOnly never authorize a write — the plugin's endpoints must check owner access and CSRF again. */
export type ExtensionSettingsTabProps = ExtensionViewProps;
/** A separate tab in the Settings dialog, listed after the built-in tabs under `title`; requires a settingsTabs grant
 * for its id. The tab icon is the plugin's package.json procs.icon (Phosphor class), else the standard puzzle. */
export type ExtensionSettingsTab = { id: string; title: string; description?: string; component: ComponentType<ExtensionSettingsTabProps> };
export type ExtensionPage = { id: string; title: string; component: ComponentType<ExtensionViewProps> };
export type ExtensionPanel = { id: string; title: string; component: ComponentType<ExtensionViewProps> };
export type ExtensionAction = { id: string; title: string; run: (context: ExtensionContext) => void | Promise<void>; mutates?: boolean };
/** Trusted, build-time React module. Never populate this from HTML or a remote module URL. */
export type UiExtension = {
  id: string;
  apiVersion: 1;
  pages?: readonly ExtensionPage[];
  /** Page menu entries. Plugin entries appear under Pages, not directly in the sidebar. */
  navigation?: readonly { page: string; title: string }[];
  /** Opt-in direct sidebar links; each page also requires a sidebarNavigation grant. */
  sidebarNavigation?: readonly { page: string; title: string }[];
  panels?: readonly ExtensionPanel[];
  canvasKinds?: readonly ExtensionCanvasKind[];
  /** Plugin-owned input cards; explicit inputKinds grants are required. */
  inputKinds?: readonly ExtensionInputKind[];
  /** Start-page buttons opening local Canvas tabs; each also requires a canvasLaunchers grant. */
  canvasLaunchers?: readonly ExtensionCanvasLauncher[];
  /** Provider connection forms for the Models settings tab; each also requires a modelProviders grant. */
  modelProviders?: readonly ExtensionModelProvider[];
  /** Detail renderers for host chat cards; each also requires a chatCards grant. */
  chatCards?: readonly ExtensionChatCard[];
  /** Own tabs in the Settings dialog; each also requires a settingsTabs grant. */
  settingsTabs?: readonly ExtensionSettingsTab[];
  actions?: readonly ExtensionAction[];
};
export type ExtensionGrant = Readonly<{ inputKinds?: readonly string[]; pages?: readonly string[]; sidebarNavigation?: readonly string[]; panels?: readonly string[]; actions?: readonly string[]; canvasKinds?: readonly string[]; canvasLaunchers?: readonly string[]; modelProviders?: readonly string[]; chatCards?: readonly string[]; settingsTabs?: readonly string[] }>;
export type RegisteredView = Readonly<{ key: string; title: string; component: ComponentType<ExtensionViewProps> }>;
/** A granted launcher; `icon` is resolved (launcher icon, else plugin icon, else null → default). */
export type RegisteredLauncher = Readonly<Omit<ExtensionCanvasLauncher, 'icon'> & { key: string; icon: string | null }>;
export type RegisteredAction = Readonly<ExtensionAction & { key: string }>;
/** A granted settings tab; `key` is `<extension>/<id>`, `extension` the owning plugin, `icon` the plugin icon or null. */
export type RegisteredSettingsTab = Readonly<ExtensionSettingsTab & { key: string; extension: string; icon: string | null }>;
export type ExtensionRegistry = Readonly<{
  inputKinds: readonly Readonly<ExtensionInputKind & { key: string }>[];
  pages: readonly RegisteredView[];
  navigation: readonly Readonly<{ key: string; title: string }>[];
  sidebarNavigation: readonly Readonly<{ key: string; title: string }>[];
  panels: readonly RegisteredView[];
  canvasKinds: readonly Readonly<ExtensionCanvasKind & { key: string }>[];
  canvasLaunchers: readonly RegisteredLauncher[];
  modelProviders: readonly Readonly<ExtensionModelProvider & { key: string }>[];
  chatCards: readonly Readonly<ExtensionChatCard & { key: string }>[];
  settingsTabs: readonly RegisteredSettingsTab[];
  actions: readonly RegisteredAction[];
}>;
