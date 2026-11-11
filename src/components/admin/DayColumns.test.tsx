import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { LanguageProvider } from '../../context/LanguageContext';
import type { AdminBooking } from '../../data/admin';
import type { DayHours, Stylist, StylistDayOff } from '../../data/types';
import { DayColumns } from './DayColumns';
import { adminBooking, eleganceHours, stylists } from './fixtures';

interface DayOptions {
  day?: Date;
  hours?: DayHours | null;
  stylists?: Stylist[];
  daysOff?: StylistDayOff[];
}

function renderColumns(
  bookings: AdminBooking[],
  handlers = { onSlotTap: vi.fn(), onBookingTap: vi.fn() },
  { day = new Date(2030, 0, 8), hours = eleganceHours[2], stylists: cols = stylists, daysOff = [] }: DayOptions = {}
) {
  render(
    <LanguageProvider>
      <DayColumns day={day} stylists={cols} hours={hours} daysOff={daysOff} bookings={bookings} {...handlers} />
    </LanguageProvider>
  );
  return handlers;
}

describe('DayColumns', () => {
  it('draws one column per stylist', () => {
    renderColumns([]);
    expect(screen.getByText('Amina')).toBeInTheDocument();
    expect(screen.getByText('Leila')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
  });

  it('hides cancelled bookings and opens the others', () => {
    const kept = adminBooking();
    const cancelled = adminBooking({ id: 'b2', clientName: 'Lina', status: 'cancelled', stylistId: 'sara', stylistName: 'Sara' });
    const { onBookingTap } = renderColumns([kept, cancelled]);
    expect(screen.queryByRole('button', { name: /Lina/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Yasmine/ }));
    expect(onBookingTap).toHaveBeenCalledWith(kept);
  });

  it('shows where a booking came from as an icon on the name line (fits 45-minute bookings)', () => {
    renderColumns([adminBooking({ source: 'staff' })]);
    const block = screen.getByRole('button', { name: /Yasmine/ });
    expect(block).toHaveTextContent('ajouté par vous');
    expect(screen.getByText('ajouté par vous')).toHaveClass('sr-only');
  });

  it('slot tap sends salon wall-clock time', () => {
    // 09:00Z is 10:00 in Algiers, whatever timezone the test machine uses (run with TZ=UTC too).
    const { onSlotTap } = renderColumns([adminBooking()]);
    const cell = screen.getByRole('button', { name: 'Sara 10:00' });
    fireEvent.click(cell);
    expect(onSlotTap).toHaveBeenCalledWith('sara', '10:00');
    expect(screen.getByRole('button', { name: /Yasmine/ }).style.top).toBe(cell.style.top);
  });

  it('does not offer empty cells under an existing booking', () => {
    renderColumns([adminBooking()]);
    expect(screen.queryByRole('button', { name: 'Amina 10:00' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Amina 11:00' })).toBeInTheDocument();
  });
});

describe('DayColumns quarter hours', () => {
  it('offers the free quarter-hours next to a booking that starts or ends at :15', () => {
    // 09:15Z–10:15Z = 10:15–11:15 in Algiers
    renderColumns([adminBooking({ startIso: '2030-01-08T09:15:00Z' })]);
    expect(screen.getByRole('button', { name: 'Amina 10:00' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Amina 11:15' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Amina 10:30' })).toBeNull();
  });
});

describe('DayColumns follows the day', () => {
  const thursday = new Date(2030, 0, 10);
  const shortThursday: DayHours = { opens: 9 * 60, closes: 13 * 60 };
  // 15:00Z is 16:00 in Algiers, after Thursday's 13:00 closing.
  const late = () => adminBooking({ id: 'late', clientName: 'Nour', startIso: '2030-01-10T15:00:00Z' });

  it('stretches the grid to a booking outside the hours and marks it', () => {
    renderColumns([late()], undefined, { day: thursday, hours: shortThursday });
    const block = screen.getByRole('button', { name: /Nour/ });
    expect(within(block).getByText('hors horaires')).toBeVisible();
    expect(screen.getByText('17:00')).toBeInTheDocument(); // grid reaches the booking's end
    // Free time is only offered inside the day's hours.
    expect(screen.getByRole('button', { name: 'Sara 12:30' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sara 13:00' })).toBeNull();
  });

  it('does not mark a booking inside the hours', () => {
    renderColumns([adminBooking()]);
    expect(screen.queryByText('hors horaires')).toBeNull();
  });

  it('greys out a stylist who does not work that day, but keeps her column tappable', () => {
    const onSlotTap = vi.fn();
    renderColumns([], { onSlotTap, onBookingTap: vi.fn() }, {
      daysOff: [{ id: 'o1', stylistId: 'leila', from: '2030-01-08', to: '2030-01-08' }],
    });
    expect(screen.getByText('Leila')).toHaveClass('opacity-60');
    expect(screen.getByText('Amina')).not.toHaveClass('opacity-60');
    const cell = screen.getByRole('button', { name: 'Leila 10:00' });
    expect(cell.parentElement).toHaveClass('opacity-60');
    fireEvent.click(cell);
    expect(onSlotTap).toHaveBeenCalledWith('leila', '10:00');
  });

  it('greys out a stylist outside her workdays', () => {
    const cols = stylists.map((s) => (s.id === 'sara' ? { ...s, workdays: [3, 4] as Stylist['workdays'] } : s));
    renderColumns([], undefined, { stylists: cols });
    expect(screen.getByText('Sara')).toHaveClass('opacity-60');
  });

  it("a hidden stylist's column shows her booking but offers no free time", () => {
    const cols = stylists.map((s) => (s.id === 'amina' ? { ...s, active: false } : s));
    renderColumns([adminBooking()], undefined, { stylists: cols });
    expect(screen.getByText('Amina')).toHaveClass('opacity-60');
    expect(screen.getByRole('button', { name: /Yasmine/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Amina / })).toBeNull();
  });

  it('a closed day with bookings still shows them under the closed notice', () => {
    const onBookingTap = vi.fn();
    renderColumns([late()], { onSlotTap: vi.fn(), onBookingTap }, { day: thursday, hours: null });
    expect(screen.getByText('Fermé')).toBeInTheDocument();
    const block = screen.getByRole('button', { name: /Nour/ });
    expect(within(block).getByText('hors horaires')).toBeInTheDocument();
    fireEvent.click(block);
    expect(onBookingTap).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Sara / })).toBeNull(); // nothing to add on a closed day
  });

  it('a closed day without bookings only shows the closed message', () => {
    renderColumns([], undefined, { day: thursday, hours: null });
    expect(screen.getByText('Fermé')).toBeInTheDocument();
    expect(screen.queryByText('09:00')).toBeNull();
  });
});
