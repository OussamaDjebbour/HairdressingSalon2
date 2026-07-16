import { ButtonHTMLAttributes } from 'react';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  state?: 'available' | 'selected' | 'disabled';
}

export function TimeSlotChip({ state = 'available', className, children, ...props }: ChipProps) {
  const stateClass =
    state === 'selected'
      ? 'chip-selected'
      : state === 'disabled'
      ? 'chip-disabled'
      : 'chip-available';

  return (
    <button className={`${stateClass} ${className ?? ''}`} {...props}>
      {children}
    </button>
  );
}
