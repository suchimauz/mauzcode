import { ArrowRightLeft, Archive, BookOpen, CircleCheck, CircleStop, Clock, Info, List, Plug, Ticket, Unplug, User, ClipboardList, Code2, Compass, FilePenLine, FilePlus2, FileText, Flag, ListChecks, MessageSquare, MessageSquareCheck, MessageSquareText, PanelRight, Search, Target, Terminal, Users, Wrench, type LucideIcon } from 'lucide-react';

/** The server's icon allow-list (tools.normalizePresentation) mapped to lucide. The client holds no per-tool table. */
const ICONS: Record<string, LucideIcon> = {
  file: FileText, 'file-plus': FilePlus2, 'file-edit': FilePenLine, search: Search, terminal: Terminal, code: Code2,
  answer: MessageSquareText, checklist: ListChecks, check: CircleCheck, delegate: Users, flag: Flag, form: ClipboardList,
  canvas: PanelRight, archive: Archive, compass: Compass, book: BookOpen, target: Target, comment: MessageSquare,
  'comment-check': MessageSquareCheck, plug: Plug, unplug: Unplug, stop: CircleStop, info: Info, ticket: Ticket,
  clock: Clock, user: User, list: List, status: ArrowRightLeft, wrench: Wrench,
};
export const TOOL_CATEGORIES = ['files', 'search', 'commands', 'agent', 'git', 'tools'] as const;
export type ToolCategory = typeof TOOL_CATEGORIES[number];

export function toolIcon(id?: string | null): LucideIcon { return (id && ICONS[id]) || Wrench; }
export function toolCategory(value?: string | null): ToolCategory { return (TOOL_CATEGORIES as readonly string[]).includes(value || '') ? value as ToolCategory : 'tools'; }
/** Server fields with the minimal fallback for events from an older server: wrench, raw name, no summary. */
export function toolPresentation(fields: { name?: string | null; label?: string | null; icon?: string | null; category?: string | null; summary?: string | null }) {
  const name = fields.name || 'tool';
  return { label: fields.label || name, Icon: toolIcon(fields.icon), icon: fields.icon || 'wrench', category: toolCategory(fields.category), summary: fields.summary || '' };
}
