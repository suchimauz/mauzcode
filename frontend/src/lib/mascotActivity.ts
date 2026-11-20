import type { EventPage } from './mauzcode';

/** What the agent is doing, as one word every mascot renderer understands. */
export type MascotActivity = 'idle' | 'thinking' | 'command' | 'git' | 'testing' | 'editing' | 'reading' | 'searching' | 'browsing' | 'delegating' | 'planning' | 'waiting' | 'compacting' | 'error';

const TESTS = /^\s*(?:\S+=\S*\s+)*(?:bun\s+(?:run\s+)?test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|npx\s+(?:vitest|jest)|vitest|jest|pytest|go\s+test|cargo\s+test)\b/;

function commandOf(args: Record<string, unknown> | undefined): string {
  const value = args?.command ?? args?.cmd;
  return typeof value === 'string' ? value.replace(/^\s*cd\s+[^;&|]+(?:&&|;)\s*/, '') : '';
}

/** Classify one running tool by its wire name (and, for shells, its command). */
export function toolActivity(name: string, args?: Record<string, unknown>): MascotActivity {
  const tool = name.toLowerCase();
  if (tool === 'bash') {
    const command = commandOf(args);
    if (/^\s*git\s/.test(command)) return 'git';
    if (TESTS.test(command)) return 'testing';
    return 'command';
  }
  if (tool === 'edit' || tool === 'write') return 'editing';
  if (tool === 'read' || tool === 'read_result') return 'reading';
  if (tool === 'grep' || tool === 'find') return 'searching';
  if (/web|browser|fetch/.test(tool)) return 'browsing';
  if (tool === 'delegate_task') return 'delegating';
  if (tool === 'todo_update' || tool === 'todo_done') return 'planning';
  if (tool === 'request_input') return 'waiting';
  return 'command';
}

/** The page's current activity: the first running tool wins, then compaction, thinking/running, a stored error, idle. */
export function mascotActivity(page: EventPage | null): MascotActivity {
  const tool = page?.activeTools?.[0];
  if (tool) return toolActivity(tool.name, tool.args);
  if (page?.compactionRetry) return 'compacting';
  if (page?.thinking || page?.isRunning) return 'thinking';
  if (page?.lastError) return 'error';
  return 'idle';
}
