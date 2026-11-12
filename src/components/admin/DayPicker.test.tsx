import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { AdminBooking } from '../../data/admin';
import { toYmd } from '../../data/bookings';
import type { Service, Stylist, StylistDayOff } from '../../data/types';
import { adminBooking } from './fixtures';

let monthBookings: AdminBooking[] = [];
let bookingsLoading = false;
let bookingsError = false;
const refetchBookings = vi.fn();
const rangeCalls: Array<[string, string]> = [];
vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useAdminBookings: (from: Date, to: Date) => {
    rangeCalls.push([toYmdLocal(from), toYmdLocal(to)]);
    return {
      data: bookingsLoading || bookingsError ? undefined : monthBookings,
      isLoading: bookingsLoading, isError: bookingsError, refetch: refetchBookings,
    };
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
let stylistsLoading = false;
vi.mock('../../data/queries', async () => {
  const f = await import('./fixtures');
  return {
    useAllServices: () => ({ data: servicesOverride ?? f.services }),
    useAllStylists: () => ({ data: stylistsLoading ? undefined : stylistsOverride ?? f.stylists }),
  };
});

import { LanguageProvider } from '../../context/LanguageContext';
import { optionNames, pickOption } from '../../test/select';
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
  bookingsError = false;
  stylistsLoading = false;
  refetchBookings.mockClear();
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


describe('DayPicker — room for a service and coiffeuse', () => {
  const coupe = { serviceId: 'coupe-femme', stylistId: null };
  const withAmina = { serviceId: 'coupe-femme', stylistId: 'amina' };

  it('offers active services and coiffeuses only, with “Toutes”', async () => {
    const f = await import('./fixtures');
    servicesOverride = [...f.services, { ...f.services[0], id: 'old', name: { fr: 'Ancienne', ar: 'قديمة' }, active: false }];
    stylistsOverride = [...f.stylists, { ...f.stylists[0], id: 'gone', name: 'Partie', active: false }];
    renderPicker();
    expect(optionNames('Prestation')).toEqual(['Toutes', 'Coupe & Brushing', 'Manucure']);
    expect(optionNames('Coiffeuse')).toEqual(['Toutes', 'Amina', 'Leila', 'Sara']);
  });

  it('filters with Radix menus labelled Prestation and Coiffeuse', () => {
    renderPicker();
    expect(screen.getByRole('combobox', { name: 'Prestation' })).toHaveTextContent('Toutes');
    expect(screen.getByRole('combobox', { name: 'Coiffeuse' })).toHaveTextContent('Toutes');
    expect(document.querySelector('select')).toBeNull();
  });

  it('reports the chosen service', () => {
    const { onFilterChange } = renderPicker();
    pickOption('Prestation', 'Coupe & Brushing');
    expect(onFilterChange).toHaveBeenCalledWith({ serviceId: 'coupe-femme', stylistId: null });
  });

  it('“Toutes” reports no choice', () => {
    const { onFilterChange } = renderPicker(withAmina);
    pickOption('Coiffeuse', 'Toutes');
    expect(onFilterChange).toHaveBeenCalledWith({ serviceId: 'coupe-femme', stylistId: null });
  });

  it('counts the start times that fit each day', () => {
    renderPicker(coupe);
    const tuesday8 = screen.getByRole('button', { name: /^Mardi 8 janvier — \d+ créneaux$/ });
    expect(within(tuesday8).getByTestId('room-count')).toHaveClass('bg-sage-100');
  });

  it('few start times read amber', () => {
    // Amina busy all day except 16:00–17:00 (one 60-min start)
    monthBookings = [
      adminBooking({ id: 'x1', startIso: '2030-01-09T08:00:00Z', stylistId: 'amina', status: 'confirmed' }),
      adminBooking({ id: 'x2', startIso: '2030-01-09T16:00:00Z', stylistId: 'amina', status: 'confirmed' }),
    ].map((b, i) => ({ ...b, endsAt: new Date(b.startsAt.getTime() + (i === 0 ? 420 : 60) * 60000) }));
    renderPicker(withAmina);
    const wednesday = screen.getByRole('button', { name: 'Mercredi 9 janvier — 1 créneau' });
    expect(within(wednesday).getByTestId('room-count')).toHaveClass('bg-amber-100');
  });

  it('says why a day has no room: her day off, or fully booked', () => {
    daysOff = [{ id: 'o1', stylistId: 'amina', from: '2030-01-09', to: '2030-01-09' }];
    monthBookings = [{ ...adminBooking({ startIso: '2030-01-10T08:00:00Z', stylistId: 'amina', status: 'confirmed' }), endsAt: new Date('2030-01-10T17:00:00Z') }];
    renderPicker(withAmina);
    expect(screen.getByRole('button', { name: 'Mercredi 9 janvier — absente' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jeudi 10 janvier — complet' })).toBeInTheDocument();
  });

  it('a tapped day lists its free times; a tapped time is picked', () => {
    const { onJump, onPickTime } = renderPicker(withAmina);
    fireEvent.click(screen.getByRole('button', { name: /^Jeudi 10 janvier — / }));
    expect(onJump).not.toHaveBeenCalled();
    expect(screen.getByText('Libre le Jeudi 10 janvier à :')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '11:00' }));
    expect(onPickTime).toHaveBeenCalledTimes(1);
    const pick = onPickTime.mock.calls[0][0];
    expect({ ...pick, date: toYmd(pick.date) }).toEqual({ date: '2030-01-10', time: '11:00', stylistId: 'amina', serviceId: 'coupe-femme' });
  });

  it('“Voir la journée” jumps to the tapped day', () => {
    const { onJump } = renderPicker(withAmina);
    fireEvent.click(screen.getByRole('button', { name: /^Jeudi 10 janvier — / }));
    fireEvent.click(screen.getByRole('button', { name: 'Voir la journée' }));
    expect(toYmd(onJump.mock.calls[0][0])).toBe('2030-01-10');
  });

  it('never says “complet” while the month is loading', () => {
    bookingsLoading = true;
    renderPicker(withAmina);
    expect(screen.queryAllByRole('button', { name: /complet/ })).toHaveLength(0);
  });

  it('a remembered choice that was hidden since counts as “Toutes”', () => {
    renderPicker({ serviceId: 'gone', stylistId: 'hidden-one' });
    expect(screen.getByRole('button', { name: 'Mardi 8 janvier — 0%' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /absente/ })).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: 'Prestation' })).toHaveTextContent('Toutes');
  });
});

describe('DayPicker — loading and errors', () => {
  it('a month that failed to load says so, offers a retry, and shows no day as empty', () => {
    bookingsError = true;
    renderPicker();
    expect(screen.getByText('Impossible de charger le contenu.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refetchBookings).toHaveBeenCalled();
    expect(screen.queryAllByRole('button', { name: /— 0%/ })).toHaveLength(0);
  });

  it('a month still loading shows no day as empty', () => {
    bookingsLoading = true;
    renderPicker();
    expect(screen.queryAllByRole('button', { name: /— 0%/ })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Mardi 8 janvier' })).toBeInTheDocument();
  });

  it('never says “complet” while the coiffeuses are still loading', () => {
    stylistsLoading = true;
    renderPicker({ serviceId: 'coupe-femme', stylistId: null });
    expect(screen.queryAllByRole('button', { name: /complet/ })).toHaveLength(0);
  });
});
