import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MessageInput } from '../components/mauzcode/MessageInput';

function Fixture({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState('hello');
  return <MessageInput value={value} onChange={setValue} onSend={vi.fn()} commandsEnabled disabled={disabled}
    bar={{ start: <button type="button">Model</button>, end: <span data-testid="gap">voice</span> }} />;
}
it('renders the bar inside the frame with send at its right end', () => {
  render(<Fixture />);
  const bar = document.querySelector('.composer-inbar')!;
  expect(screen.getByRole('form', { name: 'Ввод сообщения' })).toContainElement(bar as HTMLElement);
  expect(bar.lastElementChild).toBe(screen.getByRole('button', { name: 'Отправить сообщение' }));
});
it('a press on empty space in the bar focuses the editor; a press on a control does not', () => {
  render(<Fixture />);
  const editor = screen.getByRole('textbox');
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Model' }), { button: 0 });
  expect(editor).not.toHaveFocus();
  for (const target of [document.querySelector('.composer-inbar-spacer')!, screen.getByTestId('gap'), document.querySelector('.composer-inbar')!]) {
    (document.activeElement as HTMLElement | null)?.blur();
    const event = fireEvent.pointerDown(target, { button: 0 });
    expect(event, target.className || target.tagName).toBe(false); // default prevented, so focus does not land on the form first
    expect(editor).toHaveFocus();
  }
});
// The secondary-button case is covered in Chrome (jsdom has no PointerEvent, so `button` is lost).
it('does nothing while the input is disabled', () => {
  render(<Fixture disabled />);
  fireEvent.pointerDown(document.querySelector('.composer-inbar-spacer')!, { button: 0 });
  expect(screen.getByRole('textbox')).not.toHaveFocus();
});
