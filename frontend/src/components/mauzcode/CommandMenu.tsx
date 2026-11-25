import { useEffect } from 'react';
import { presentationIcon } from './presentationIcons';
import type { CommandSection } from '../../lib/commands';
import type { ComposerCommand } from '../../hooks/useCommandMenu';
import './command-menu.css';

export function CommandMenu({ id, sections, commands, index, status, error, onPick, onHover, onRetry }: {
  id: string; sections: CommandSection[]; commands: ComposerCommand[]; index: number; status: 'idle' | 'loading' | 'ready' | 'error'; error: string;
  onPick: (command: ComposerCommand) => void; onHover: (index: number) => void; onRetry: () => void;
}) {
  useEffect(() => {
    if (status !== 'ready') return;
    document.getElementById(`${id}-${index}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [id, index, status, commands]);
  return <div className="command-menu" onMouseDown={event => event.preventDefault()}>
    <div id={id} role="listbox" aria-label="Добавить файл или выполнить команду" aria-busy={status === 'loading'}>
      {status === 'ready' && sections.map(section => commands.some(c => c.section === section.id) && <div role="group" aria-label={section.label} key={section.id}>
        <div className="command-menu-label">{section.label}</div>
        {commands.map((command, itemIndex) => {
          if (command.section !== section.id) return null;
          const Icon = presentationIcon(command.icon);
          return <button type="button" key={command.option?.value ?? command.name} id={`${id}-${itemIndex}`} role="option" aria-disabled={!command.enabled || undefined} aria-selected={index === itemIndex} className="command-menu-option" title={command.enabled ? undefined : command.reason} onPointerMove={() => onHover(itemIndex)} onClick={() => { if (command.enabled) onPick(command); }}>
            <Icon size={14} strokeWidth={1.3} aria-hidden="true" /><span className="command-menu-name">{command.option?.label ?? command.option?.value ?? command.label}</span>{command.skill && !command.option && <span className="command-menu-source">{command.skill.source}</span>}<span className="command-menu-description">{!command.enabled ? command.reason : command.option ? command.option.description : command.description}</span>
          </button>;
        })}
      </div>)}
    </div>
    {status === 'loading' && <div className="command-menu-message" role="status">Загрузка команд…</div>}
    {status === 'error' && <div className="command-menu-message" role="alert">{error} <button type="button" onClick={onRetry}>Повторить</button></div>}
    {status === 'ready' && !commands.length && <div className="command-menu-message" role="status">Команда не найдена</div>}
  </div>;
}
