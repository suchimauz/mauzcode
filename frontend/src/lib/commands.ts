import { ApiError, requestJson } from './mauzcode';

export type ClientAction = 'attach-file' | 'open-goal' | { type: 'open-canvas'; kind: string; args: Record<string, unknown> };
export type CommandSection = { id: string; label: string; order: number };
export type CommandOption = { value: string; label?: string; description?: string };
export type CommandDescriptor = { name: string; description: string; usage: string[]; inputHint?: string; attachments?: boolean; kind: string; label: string; icon: string; section: string; order: number; enabled: boolean; reason?: string; args?: { placeholder?: string; options?: CommandOption[] }; clientAction?: ClientAction };
export type CommandCatalogue = { version: 2; sections: CommandSection[]; commands: CommandDescriptor[]; csrfToken?: string };
export type CommandResult = { ok: boolean; command: string; operationId: string; status: 'running' | 'completed' | 'failed' | 'interrupted'; error?: string; result?: { status: 'compacted' | 'not_needed' | 'stale' } };
export function supportedCommand(command: CommandDescriptor) {
  const action = command.clientAction;
  return command.kind !== 'client' || action === 'attach-file' || action === 'open-goal' || (typeof action === 'object' && action?.type === 'open-canvas' && ['url', 'file'].includes(action.kind));
}
/** Preserve the caller's key across uncertain retries, including after refreshing the catalogue. */
export async function executeCommand(agentId: string, text: string, requestId: string, token?: string): Promise<CommandResult> {
  const csrfToken = token ?? (await getCommands(agentId)).csrfToken;
  if (!csrfToken) throw new Error('Сервер не выдал токен команды. Обновите страницу.');
  return requestJson<CommandResult>(`/agent/${encodeURIComponent(agentId)}/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ text, requestId }) });
}
export async function getCommands(agentId?: string, signal?: AbortSignal): Promise<CommandCatalogue> {
  const query = new URLSearchParams({ version: '2', ...(agentId ? { agentId } : {}) });
  const value = await requestJson<CommandCatalogue>(`/commands?${query}`, { signal }).catch(reason => {
    if (reason instanceof ApiError && reason.status === 404) throw new Error('Команды ещё недоступны на сервере. Повторите позже.');
    throw reason;
  });
  if (value.version !== 2 || !Array.isArray(value.commands) || !Array.isArray(value.sections)) throw new Error('Каталог команд недоступен. Повторите попытку.');
  return value;
}
/** Keep absolute paths and dotted filenames in ordinary chat; only command-shaped names are resolved. */
export function commandToken(text: string) { return /^\/([a-zA-Z][\w-]*(?:(?:\.[a-zA-Z][\w-]*)*:[a-zA-Z][\w-]*)?)(?=\s|$)/.exec(text)?.[0]; }
/** Resolve on submission too: pasted commands need not have opened the menu. */
export async function validateCommand(text: string, fileCount = 0, agentId?: string) {
  const token = commandToken(text);
  if (!token) return;
  const { commands, csrfToken } = await getCommands(agentId);
  const command = commands.find(item => item.name === token.slice(1) && supportedCommand(item));
  if (!command) throw new Error('Неизвестная команда. Введите /, чтобы выбрать команду из списка.');
  if (!command.enabled) throw new Error(command.reason || 'Команда недоступна');
  if (fileCount && !command.attachments) throw new Error(`Команда /${command.name} пока не принимает файлы. Уберите вложения или отправьте их отдельным сообщением.`);
  return { command, csrfToken, args: text.slice(token.length).trim() };
}
export async function runClientCommand(action: ClientAction | undefined, args: string, handlers: { file: () => void; goal?: (text: string) => void; agentId?: string; csrfToken?: string }) {
  if (action === 'attach-file') { handlers.file(); return; }
  if (action === 'open-goal' && handlers.goal) { handlers.goal(args); return; }
  if (typeof action === 'object' && action.type === 'open-canvas' && handlers.agentId && handlers.csrfToken) {
    await requestJson(`/canvas/${encodeURIComponent(handlers.agentId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': handlers.csrfToken }, body: JSON.stringify({ show: { kind: action.kind, args: action.args } }) }); return;
  }
  throw new Error('Действие недоступно в этом чате.');
}
export function notifyPlanningChanged(agentId: string) { window.dispatchEvent(new CustomEvent('mauzcode-planning-changed', { detail: agentId })); }
