import { requestJson } from './mauzcode';

/** Where a voice provider processes captured audio; disclosed before any microphone access. */
export type VoiceDestination = { kind: 'cloud' | 'host'; label: string };
export type VoiceFieldSpec = { key: string; label: string; type: 'text' | 'url' | 'select' | 'secret' | 'number' | 'boolean'; required?: boolean; help?: string; placeholder?: string; default?: string | number | boolean; options?: { value: string; label: string }[] };
export type VoiceModel = { id: string; label?: string; description?: string };
/** Network route of one voice connection; non-direct kinds only reference saved infrastructure. */
export type VoiceTransportSpec = { kind: 'direct' } | { kind: 'socks'; proxyId: string } | { kind: 'ssh-tunnel'; instance: string };
export type VoiceProviderView = { id: string; label: string; description?: string; destination: VoiceDestination; transports: VoiceTransportSpec['kind'][]; fields: VoiceFieldSpec[]; models: VoiceModel[] };
/**
 * Secret-free connection: secret fields are only reported as stored (`true`) or not (`false`). `destination` is
 * where this connection actually sends audio (the provider's per-connection disclosure, else its declaration).
 */
export type VoiceConnectionView = { id: string; provider: string; providerRegistered: boolean; accountName: string; config: Record<string, string | number | boolean>; transport: VoiceTransportSpec; secrets: Record<string, boolean>; destination?: VoiceDestination; createdAt: number; updatedAt: number };
export type VoiceRouteOption = { route: string; provider: string; accountName: string; connectionId: string; modelId: string; label: string; description?: string; destination: VoiceDestination };
export type VoiceTestResult = { status: 'available' | 'unavailable' | 'configured' | 'disabled'; reason: string; message: string; checkedAt: number };
/** Effective voice route of one chat; `unavailable` keeps the selected route instead of falling back. */
export type VoiceChatRoute =
  | { agentId: string; route: ''; source: 'none'; status: 'unconfigured' }
  | { agentId: string; route: string; source: 'override' | 'default'; status: 'ready'; destination: VoiceDestination; model: VoiceModel }
  | { agentId: string; route: string; source: 'override' | 'default'; status: 'unavailable'; reason: string };
export type VoiceState = { providers: VoiceProviderView[]; connections: VoiceConnectionView[]; routes: VoiceRouteOption[]; defaultRoute: { route: string; fixed: boolean }; chat?: VoiceChatRoute; proxies?: { id: string; name: string | null; host: string; port: number }[]; instances?: string[]; csrfToken: string };
/** Create/update payload. Secrets: omitted key keeps the stored value, null clears it. */
export type VoiceConnectionInput = { accountName: string; config: Record<string, unknown>; secrets: Record<string, string | null>; transport?: VoiceTransportSpec };

const PATH = '/voice/api';

export async function getVoiceState(agentId?: string, signal?: AbortSignal): Promise<VoiceState> {
  const data = await requestJson<VoiceState>(agentId ? `${PATH}?agentId=${encodeURIComponent(agentId)}` : PATH, { signal });
  if (!Array.isArray(data.providers) || !Array.isArray(data.connections) || !Array.isArray(data.routes) || typeof data.csrfToken !== 'string') throw new Error('Не удалось загрузить настройки голоса');
  return data;
}

function post<T>(csrfToken: string, body: Record<string, unknown>) {
  return requestJson<T>(PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) });
}

export const createVoiceConnection = (csrf: string, provider: string, input: VoiceConnectionInput) =>
  post<{ connection: VoiceConnectionView }>(csrf, { action: 'create', provider, ...input }).then(r => r.connection);
export const updateVoiceConnection = (csrf: string, id: string, input: VoiceConnectionInput) =>
  post<{ connection: VoiceConnectionView }>(csrf, { action: 'update', id, ...input }).then(r => r.connection);
/** The backend rejects removal without explicit `confirmed: true`. */
export const removeVoiceConnection = (csrf: string, id: string) => post<{ removed: string }>(csrf, { action: 'remove', id, confirmed: true });
export const testVoiceConnection = (csrf: string, id: string) => post<{ result: VoiceTestResult }>(csrf, { action: 'test', id }).then(r => r.result);
/** An empty route clears the default; any other value must resolve now. */
export const setVoiceDefaultRoute = (csrf: string, route: string) =>
  post<{ defaultRoute: VoiceState['defaultRoute'] }>(csrf, { action: 'setDefaultRoute', route }).then(r => r.defaultRoute);
export const setVoiceChatRoute = (csrf: string, agentId: string, route: string) =>
  post<{ chat: VoiceChatRoute }>(csrf, { action: 'setChatRoute', agentId, route }).then(r => r.chat);
export const clearVoiceChatRoute = (csrf: string, agentId: string) =>
  post<{ chat: VoiceChatRoute }>(csrf, { action: 'clearChatRoute', agentId }).then(r => r.chat);

/** Plain-language audio destination, shown before activation. */
export const destinationText = (destination: VoiceDestination) =>
  destination.kind === 'host' ? `Audio stays on the MauzCode server (${destination.label}).` : `Audio is sent from the MauzCode server to ${destination.label}.`;
