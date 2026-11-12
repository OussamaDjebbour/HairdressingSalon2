import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { AdminBooking } from '../../data/admin';
import { toYmd } from '../../data/bookings';
import type { Service, Stylist, StylistDayOff } from '../../data/types';
import { adminBooking } from './fixtures';

let monthBookings: AdminBooking[] = [];
let bookingsLoading = false;
const rangeCalls: Array<[string, string]> = [];
vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useAdminBookings: (from: Date, to: Date) => {
    rangeCalls.push([toYmdLocal(from), toYmdLocal(to)]);
    return { data: bookingsLoading ? undefined : monthBookings, isLoading: bookingsLoading, isError: false, refetch: vi.fn() };
  },
}));
function toYmdLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let daysOff: StylistDayOff[] = [];
vi.mock('../../data/salonSettings', async () => {
  const f = await import('./fixtures');
  return {
    useSalonHours: () => ({ data: f.eleganceHours }),
    useClosedDates: () => ({ data: [] }),
    useStylistDaysOff: () => ({ data: daysOff }),
  };
});

let servicesOverride: Service[] | undefined;
let stylistsOverride: Stylist[] | undefined;
vi.mock('../../data/queries', async () => {
  const f = await import('./fixtures');
  return {
    useAllServices: () => ({ data: servicesOverride ?? f.services }),
    useAllStylists: () => ({ data: stylistsOverride ?? f.stylists }),
  };
});

import { LanguageProvider } from '../../context/LanguageContext';
import { DayPicker, type RoomFilter } from './DayPicker';

const tuesday = new Date(2030, 0, 8);
const noFilter: RoomFilter = { serviceId: null, stylistId: null };

function renderPicker(filter: RoomFilter = noFilter) {
  const handlers = { onFilterChange: vi.fn(), onJump: vi.fn(), onPickTime: vi.fn(), onClose: vi.fn() };
  render(
    <LanguageProvider>
      <DayPicker day={tuesday} filter={filter} {...handlers} />
    </LanguageProvider>
  );
  return handlers;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-08T07:00:00Z')); // Tuesday 8 Jan 2030, 08:00 in Algiers
  monthBookings = [];
  bookingsLoading = false;
  rangeCalls.length = 0;
  daysOff = [];
  servicesOverride = undefined;
  stylistsOverride = undefined;
});
afterEach(() => vi.useRealTimers());

describe('DayPicker — the month', () => {
  it('opens on the agenda’s month, Sunday first', () => {
    renderPicker();
    expect(screen.getByRole('dialog', { name: 'Choisir un jour' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Janvier 2030' })).toBeInTheDocument();
    expect(screen.getAllByTestId('weekday').map((n) => n.textContent)).toEqual(['D', 'L', 'M', 'M', 'J', 'V', 'S']);
    expect(rangeCalls).toContainEqual(['2030-01-01', '2030-01-31']);
  });

  it('marks the agenda’s day and disables closed days', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: 'Mardi 8 janvier — 0%' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Lundi 14 janvier — Fermé' })).toBeDisabled();
  });

  it('shows how full each open day is', () => {
    monthBookings = [adminBooking({ startIso: '2030-01-09T09:00:00Z', status: 'confirmed' })]; // 60 min of 3 × 9 h
    renderPicker();
    expect(screen.getByRole('button', { name: 'Mercredi 9 janvier — 4%' })).toBeInTheDocument();
  });

  it('marks days with website requests still waiting', () => {
    monthBookings = [adminBooking({ startIso: '2030-01-10T09:00:00Z', status: 'pending', source: 'online' })];
    renderPicker();
    expect(screen.getByRole('button', { name: /Jeudi 10 janvier — .*réservations à confirmer/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendredi 11 janvier — 0%' })).toBeInTheDocument();
  });

  it('moves month by month and loads that month', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(screen.getByRole('heading', { name: 'Février 2030' })).toBeInTheDocument();
    expect(rangeCalls).toContainEqual(['2030-02-01', '2030-02-28']);
    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(screen.getByRole('heading', { name: 'Décembre 2029' })).toBeInTheDocument();
  });

  it('jumps to a tapped day', () => {
    const { onJump, onClose } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Vendredi 11 janvier — 0%' }));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(toYmd(onJump.mock.calls[0][0])).toBe('2030-01-11');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a day of the next month shown in the grid still jumps there', () => {
    const { onJump } = renderPicker();
    const cell = screen.getByRole('button', { name: 'Samedi 2 février' });
    expect(cell).toBeEnabled();
    fireEvent.click(cell);
    expect(toYmd(onJump.mock.calls[0][0])).toBe('2030-02-02');
  });

  it('closes with Escape', () => {
    const { onClose } = renderPicker();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('every day is a full-size tap target', () => {
    renderPicker();
    const grid = screen.getByTestId('month-grid');
    for (const b of within(grid).getAllByRole('button')) expect(b).toHaveClass('tap');
  });
});

