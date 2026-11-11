import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '../../context/LanguageContext';
import type { AdminBooking } from '../../data/admin';
import { DayColumns } from './DayColumns';
import { adminBooking, eleganceHours, stylists } from './fixtures';

function renderColumns(bookings: AdminBooking[], handlers = { onSlotTap: vi.fn(), onBookingTap: vi.fn() }) {
  render(
    <LanguageProvider>
      <DayColumns day={new Date(2030, 0, 8)} stylists={stylists} hours={eleganceHours[2]} bookings={bookings} {...handlers} />
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
