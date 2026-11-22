import { presentationIcon } from './presentationIcons';
export const TOOL_CATEGORIES = ['files', 'search', 'commands', 'agent', 'git', 'tools'] as const;
export type ToolCategory = typeof TOOL_CATEGORIES[number];


export function toolCategory(value?: string | null): ToolCategory { return (TOOL_CATEGORIES as readonly string[]).includes(value || '') ? value as ToolCategory : 'tools'; }
/** Server fields with the minimal fallback for events from an older server: wrench, raw name, no summary. */
export function toolPresentation(fields: { name?: string | null; label?: string | null; icon?: string | null; category?: string | null; summary?: string | null }) {
  const name = fields.name || 'tool';
  return { label: fields.label || name, Icon: presentationIcon(fields.icon), icon: fields.icon || 'wrench', category: toolCategory(fields.category), summary: fields.summary || '' };
}
