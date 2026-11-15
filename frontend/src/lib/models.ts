import { requestJson } from './mauzcode';
import type { NavigationIcon } from './navigation';
import { readSessionSelection } from './newSession';
export type ModelOption = { provider: string; model: string; label: string; groupLabel?: string; connectionId?: string; disabled: boolean; icon: NavigationIcon | null };
/** One model connection; unavailable means its catalogue could not be loaded. */
export type ModelGroup = { connectionId: string; provider: string; accountName: string; enabled: boolean; unavailable: boolean; error?: string };
export type ModelSettings = {
  agentId: string; model: string; label: string; icon: NavigationIcon | null;
  models: ModelOption[];
  groups?: ModelGroup[];
  effort: { requested: string; applied: string; supported: string[]; mode: string };
};
export const getModelSettings = (id: string, signal?: AbortSignal) => requestJson<ModelSettings>(`/ui-lab-api/models?agentId=${encodeURIComponent(id)}`, { signal });
// Capability projection only: choosing a new-session model must not create or mutate an agent.
export async function getDraftModelSettings(model: string, effort: string, signal?: AbortSignal): Promise<ModelSettings> {
  // Fetch the catalogue independently: a removed remembered model must not trap the draft in HTTP 400.
  type Config = Omit<ModelSettings, 'agentId'> & { defaultModel: string };
  const catalogue = await requestJson<Config>('/ui-lab-api/new-session', { signal });
  const available = selectableModels(catalogue);
  // Legacy aliases of a remembered or requested route still select the canonical catalogue entry.
  const same = (value: string) => (option: ModelOption) => !!value && (option.model === value || parseModelRoute(option.model).route === parseModelRoute(value).route);
  const selected = available.find(same(model))?.model
    ?? available.find(same(readSessionSelection().model ?? ''))?.model ?? available[0]?.model ?? '';
  if (!selected) throw new Error('Нет доступных моделей');
  const config = selected === catalogue.model ? catalogue : await requestJson<Config>(`/ui-lab-api/new-session?${new URLSearchParams({ model: selected })}`, { signal });
  const requested = normalizeEffort(effort, config.effort.supported);
  return { ...config, agentId: '', model: selected, effort: { ...config.effort, requested, applied: requested === 'auto' ? config.effort.applied : requested } };
}
export const setAgentModel = (id: string, model: string) => requestJson<{ ok: boolean; model: string }>(`/api/v1/agents/${encodeURIComponent(id)}/model`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
export async function setAgentEffort(id: string, effort: string) {
  const body = new FormData(); body.set('effort', effort);
  const response = await fetch(`/agent/${encodeURIComponent(id)}/effort`, { method: 'POST', body, credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error((await response.text()).slice(0,300) || `Ошибка HTTP ${response.status}`);
  if (response.status !== 204) throw new Error('MauzCode не подтвердил сохранение настройки. Обновите список моделей.');
}
export const normalizeEffort = (effort: string, supported: string[]) => supported.includes(effort) ? effort : 'auto';
export const effortLabel = (value: string) => ({ auto: 'Default', off: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Max' }[value] ?? value);
// Canonical route template shared with the server (llm.parseModelRoute): `[ssh/<host>:]<provider>/<account>:<model>`.
export type ModelRoute = { host: string | null; provider: string; account: string; model: string; route: string };
export const parseModelRoute = (value: string): ModelRoute => {
  const ssh = /^ssh\/([^:]+):(.+)$/.exec(value);
  const host = ssh ? ssh[1] : null; const rest = ssh ? ssh[2] : value;
  const m = /^([a-z][\w-]*)(?:\/([^/:]+))?:(.+)$/.exec(rest);
  const provider = m ? m[1] : 'lmstudio'; const account = m?.[2] ?? 'default'; const model = m ? m[3] : rest;
  return { host, provider, account, model, route: `${host ? `ssh/${host}:` : ''}${provider}/${account}:${model}` };
};
// Provider-qualified parts of a route in display order: SSH host, provider, account. An explicit connection account
// label wins over the account parsed from the route; an empty route has no parts at all.
export const modelSourceParts = (value: string, accountLabel?: string): string[] => {
  if (!value) return [];
  const { host, provider } = parseModelRoute(value);
  const ssh = /^ssh\/[^:]+:(.+)$/.exec(value);
  const account = accountLabel?.trim() || /^[a-z][\w-]*\/([^/:]+):/.exec(ssh ? ssh[1] : value)?.[1];
  return [host, provider, account].filter((part): part is string => !!part);
};
// Group heading of a model: route provider plus its connection account, keeping the SSH host when present.
// An account alone is never the heading, so equal account names of different providers stay distinguishable.
export const modelGroup = (option: Pick<ModelOption, 'provider' | 'model' | 'groupLabel'>) => modelSourceParts(option.model, option.groupLabel).join(' · ');
// Stable group identity: the connection id; provider/account route prefix for options without one.
export const modelGroupKey = (option: Pick<ModelOption, 'provider' | 'model' | 'connectionId'>) => {
  if (option.connectionId) return option.connectionId;
  const route = parseModelRoute(option.model);
  return `${route.host ?? ''}|${route.provider}/${route.account}`;
};
// Account name alone, for compact captions in navigation rows.
export const modelAccount = (model: string) => parseModelRoute(model).account;
// Provider-qualified caption of a route (host · provider · account); the provider comes from the route, never from the model name.
export const modelSourceLabel = (model: string) => modelSourceParts(model).join(' · ');
// Same heading shape for a connection reported without a route, such as an unavailable catalogue.
export const connectionGroupLabel = (provider: string, accountName: string) =>
  [provider, accountName].filter(Boolean).join(' · ');
// Selectable models of a catalogue: disabled models and models of disabled connections are hidden, not merely marked.
// Generic over the option shape so every projection (chat picker, draft catalogue, extensions) shares one policy.
export const selectableModels = <T extends { disabled: boolean; connectionId?: string }>(settings: { models: T[]; groups?: ModelGroup[] }) => {
  const off = new Set((settings.groups ?? []).filter(group => !group.enabled).map(group => group.connectionId));
  return settings.models.filter(option => !option.disabled && !(option.connectionId && off.has(option.connectionId)));
};
// Enabled connections whose catalogue failed to load; a disabled connection is not a notice in a picker.
export const unavailableGroups = (settings: { groups?: ModelGroup[] }) => (settings.groups ?? []).filter(group => group.enabled && group.unavailable);
