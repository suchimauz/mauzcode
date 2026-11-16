import { requestJson } from './mauzcode';

/** Stored agent preset as projected by the owner-only Settings endpoint. */
export type AgentPresetView = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  builtin: boolean;
  allow: string[];
  deny: string[];
  plugins: string[];
  excludeSections: string[];
  prompt: string;
  updatedAt: number;
};
export type AgentPresetsState = { presets: AgentPresetView[]; defaultPresetId: string; defaultPresetMissing: boolean };

const PATH = '/ui-lab-api/agent-presets';
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string');
const isPreset = (v: unknown): v is AgentPresetView => {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.name === 'string' && typeof p.description === 'string' && typeof p.sortOrder === 'number'
    && typeof p.builtin === 'boolean' && isStrings(p.allow) && isStrings(p.deny) && isStrings(p.plugins) && isStrings(p.excludeSections)
    && typeof p.prompt === 'string' && typeof p.updatedAt === 'number';
};

/** Read every stored preset and the default selection; read-only. */
export async function getAgentPresets(signal?: AbortSignal): Promise<AgentPresetsState> {
  const data = await requestJson<Record<string, unknown>>(PATH, { signal });
  if (data.version !== 1 || !Array.isArray(data.presets) || !data.presets.every(isPreset) || typeof data.defaultPresetId !== 'string' || typeof data.defaultPresetMissing !== 'boolean') {
    throw new Error('Unexpected agent presets response.');
  }
  return { presets: data.presets, defaultPresetId: data.defaultPresetId, defaultPresetMissing: data.defaultPresetMissing };
}
