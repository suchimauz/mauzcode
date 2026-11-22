import { AlarmClock, ArrowRightLeft, Archive, BookOpen, CircleCheck, CircleDashed, CircleStop, Clock, Info, List, Paperclip, Plug, Ticket, Unplug, User, ClipboardList, Code2, Compass, FilePenLine, FilePlus2, FileText, Flag, ListChecks, MessageSquare, MessageSquareCheck, MessageSquareText, PanelRight, Search, Target, Terminal, Users, Wrench, type LucideIcon } from 'lucide-react';

/** Shared visual vocabulary for tool events and catalogue commands. Unknown keys get a safe fallback. */
const icons: Record<string, LucideIcon> = {
  file: FileText, 'file-plus': FilePlus2, 'file-edit': FilePenLine, search: Search, terminal: Terminal, code: Code2,
  answer: MessageSquareText, checklist: ListChecks, check: CircleCheck, delegate: Users, flag: Flag, form: ClipboardList,
  canvas: PanelRight, archive: Archive, compass: Compass, book: BookOpen, target: Target, comment: MessageSquare,
  'comment-check': MessageSquareCheck, plug: Plug, unplug: Unplug, stop: CircleStop, info: Info, ticket: Ticket,
  clock: Clock, user: User, list: List, status: ArrowRightLeft, wrench: Wrench,
  'alarm-clock': AlarmClock, 'list-checks': ListChecks, 'circle-dashed': CircleDashed, paperclip: Paperclip,
};
export function presentationIcon(key?: string | null): LucideIcon { return key && Object.hasOwn(icons, key) ? icons[key] : Wrench; }
