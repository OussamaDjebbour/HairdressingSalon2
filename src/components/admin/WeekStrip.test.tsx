import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '../../context/LanguageContext';
import { toYmd } from '../../data/bookings';
import { WeekStrip } from './WeekStrip';
import { dayHours } from '../../data/hours';
import type { ClosedDates } from '../../data/types';
import { adminBooking, eleganceHours } from './fixtures';

function renderStrip(onSelect = vi.fn(), closed: ClosedDates[] = []) {
  render(
    <LanguageProvider>
      <WeekStrip day={new Date(2030, 0, 8)} bookings={[adminBooking()]} stylistCount={3} hoursFor={(d) => dayHours(eleganceHours, closed, d)} onSelect={onSelect} />
    </LanguageProvider>
  );
  return onSelect;
}

describe('WeekStrip', () => {
  it('shows the 7 days of the week with Sunday and Monday closed', () => {
    renderStrip();
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('button', { name: /^Dimanche 6/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Lundi 7/ })).toBeDisabled();
  });

  it('marks the selected day and reports how full it is', () => {
    renderStrip();
    const tuesday = screen.getByRole('button', { name: /^Mardi 8/ });
    expect(tuesday).toHaveAttribute('aria-pressed', 'true');
    expect(tuesday).toHaveAccessibleName('Mardi 8 — 4%'); // 60 of 1620 stylist-minutes
  });

  it('selects another open day', () => {
    const onSelect = renderStrip();
    fireEvent.click(screen.getByRole('button', { name: /^Mercredi 9/ }));
    expect(toYmd(onSelect.mock.calls[0][0])).toBe('2030-01-09');
  });

  it('marks a closed date (holiday) closed even on a usual workday', () => {
    renderStrip(vi.fn(), [{ id: 'c1', from: '2030-01-10', to: '2030-01-10', label: null }]);
    const thursday = screen.getByRole('button', { name: /^Jeudi 10/ });
    expect(thursday).toBeDisabled();
    expect(thursday).toHaveAccessibleName('Jeudi 10 — Fermé');
    expect(screen.getByRole('button', { name: /^Vendredi 11/ })).toBeEnabled();
  });
});
