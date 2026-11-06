import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AdminBooking } from '../data/admin';
import { adminBooking } from './admin/fixtures';

vi.mock('../data/queries', async () => {
  const f = await import('./admin/fixtures');
  return {
    useServices: () => ({ data: f.services, isLoading: false, isError: false }),
    useStylists: () => ({ data: f.stylists, isLoading: false, isError: false }),
  };
});

const setStatus = vi.fn();
let weekBookings: AdminBooking[] = [];
let pendingBookings: AdminBooking[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

vi.mock('../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/admin')>()),
  // The week query spans 6 days; the pending query spans 14 days from today.
  useAdminBookings: (from: Date, to: Date) => ({
    data: Math.round((to.getTime() - from.getTime()) / DAY_MS) === 6 ? weekBookings : pendingBookings,
    isLoading: false, isError: false, error: null, refetch: vi.fn(),
  }),
  useSetBookingStatus: () => ({ mutate: setStatus, isPending: false }),
  useCreateStaffBooking: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateStaffBooking: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { LanguageProvider } from '../context/LanguageContext';
import { Schedule } from './Schedule';

function renderSchedule() {
  render(
    <LanguageProvider>
      <Schedule />
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-08T07:00:00Z')); // Tuesday 8 Jan 2030, 08:00 in Algiers
  weekBookings = [];
  pendingBookings = [];
});

afterEach(() => vi.useRealTimers());

describe('Schedule', () => {
  it('renders one column per stylist', () => {
    renderSchedule();
    expect(screen.getByText('Amina')).toBeInTheDocument();
    expect(screen.getByText('Leila')).toBeInTheDocument();
    expect(screen.getByText('Sara')).toBeInTheDocument();
  });

  it('tapping a booking opens the sheet in edit mode', () => {
    weekBookings = [adminBooking()];
    renderSchedule();
    fireEvent.click(screen.getAllByRole('button', { name: /Yasmine/ })[0]);
    expect(screen.getByRole('dialog', { name: 'Rendez-vous' })).toBeInTheDocument();
  });

  it('a cancelled booking can still be restored from the sheet', () => {
    weekBookings = [adminBooking({ status: 'cancelled' })];
    renderSchedule();
    fireEvent.click(screen.getByRole('button', { name: /Yasmine/ })); // only the side list shows cancelled ones
    fireEvent.click(screen.getByRole('button', { name: /Confirmer/ }));
    expect(setStatus).toHaveBeenCalledWith({ id: 'b1', status: 'confirmed' }, expect.anything());
  });

  it('+ opens the add sheet', () => {
    renderSchedule();
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau rendez-vous' }));
    expect(screen.getByRole('dialog', { name: 'Nouveau rendez-vous' })).toBeInTheDocument();
  });

  it('pending badge shows the count and jumps to that day', () => {
    pendingBookings = [
      adminBooking({ id: 'p2', startIso: '2030-01-11T09:00:00Z' }),
      adminBooking({ id: 'p1', startIso: '2030-01-10T09:00:00Z' }),
      adminBooking({ id: 'c1', startIso: '2030-01-09T09:00:00Z', status: 'confirmed' }),
    ];
    renderSchedule();
    fireEvent.click(screen.getByRole('button', { name: '2 en attente' }));
    expect(screen.getAllByText('Jeudi 10 janvier').length).toBeGreaterThan(0);
  });

  it('hides the pending badge when nothing is waiting', () => {
    renderSchedule();
    expect(screen.queryByRole('button', { name: /en attente/ })).toBeNull();
  });
});
