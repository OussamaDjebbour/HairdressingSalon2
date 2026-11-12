import { fireEvent, screen } from '@testing-library/react';

/** Opens a Radix Select by its label (keyboard opening is unreliable in jsdom: use a mouse pointerdown). */
export function openSelect(label: string) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name: label }), { button: 0, ctrlKey: false, pointerType: 'mouse' });
}

/** Picks an option of a Radix Select by its label and the option's name. */
export function pickOption(label: string, option: string) {
  openSelect(label);
  fireEvent.click(screen.getByRole('option', { name: option }));
}

/** The option names a Radix Select offers, in order (the menu is closed again afterwards). */
export function optionNames(label: string): (string | null)[] {
  openSelect(label);
  const names = screen.getAllByRole('option').map((o) => o.textContent);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  return names;
}
