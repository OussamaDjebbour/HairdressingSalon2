import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AdminBooking } from '../data/admin';

const mutate = vi.fn();
let bookings: AdminBooking[] = [];

vi.mock('../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/admin')>()),
  useAdminBookings: () => ({ data: bookings, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useSetBookingStatus: () => ({ mutate, isPending: false }),
}));

import { LanguageProvider } from '../context/LanguageContext';
import { Schedule } from './Schedule';

function booking(status: AdminBooking['status'], overrides: Partial<AdminBooking> = {}): AdminBooking {
  const startsAt = new Date();
  startsAt.setHours(10, 0, 0, 0);
  return {
    id: 'b1', startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60000), status, price: 2500,
    clientName: 'Yasmine', clientPhone: '0555123456', lang: 'fr', serviceId: 'coupe-femme',
    serviceName: { fr: 'Coupe & Brushing', ar: 'قص' }, stylistId: 'amina', stylistName: 'Amina',
    ...overrides,
  };
}

// The timeline block is the nearest absolutely-positioned ancestor of the client name
// (the sidebar list has none).
function timelineBlock(clientName: string): HTMLElement {
  const block = screen.getAllByText(clientName).map((el) => el.closest<HTMLElement>('.absolute')).find(Boolean);
  if (!block) throw new Error(`no timeline block for ${clientName}`);
  return block;
}

function renderSchedule() {
  render(
    <LanguageProvider>
      <Schedule />
    </LanguageProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Schedule actions', () => {
  it('a pending booking can be confirmed or cancelled', () => {
    bookings = [booking('pending')];
    renderSchedule();
    expect(screen.getByRole('button', { name: /^Confirmer$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Annuler$/ })).toBeInTheDocument();
  });

  it('a cancelled booking can be restored (re-confirmed) after an accidental cancel', () => {
    bookings = [booking('cancelled')];
    renderSchedule();
    expect(screen.queryByRole('button', { name: /^Annuler$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Confirmer$/ }));
    expect(mutate).toHaveBeenCalledWith({ id: 'b1', status: 'confirmed' }, expect.anything());
  });
});

describe('Schedule timeline', () => {
  it('draws same-time bookings for different stylists side by side, not on top of each other', () => {
    bookings = [
      booking('pending'),
      booking('confirmed', { id: 'b2', clientName: 'Lina', stylistId: 'sara', stylistName: 'Sara' }),
    ];
    renderSchedule();
    const a = timelineBlock('Yasmine');
    const b = timelineBlock('Lina');
    expect(a.style.width).toContain('50%');
    expect(b.style.width).toContain('50%');
    expect(a.style.insetInlineStart).not.toBe(b.style.insetInlineStart);
  });
});
