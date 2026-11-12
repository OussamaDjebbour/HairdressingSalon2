import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AdminBooking } from '../data/admin';
import type { SalonHours, Stylist, StylistDayOff } from '../data/types';
import { adminBooking, eleganceHours, stylists } from './admin/fixtures';

let stylistsOverride: Stylist[] | undefined;
vi.mock('../data/queries', async () => {
  const f = await import('./admin/fixtures');
  const allStylists = () => stylistsOverride ?? f.stylists;
  return {
    // The public hooks are active-only; the agenda must use the "all" ones.
    useServices: () => ({ data: f.services, isLoading: false, isError: false }),
    useStylists: () => ({ data: allStylists().filter((s) => s.active), isLoading: false, isError: false }),
    useAllServices: () => ({ data: f.services, isLoading: false, isError: false }),
    useAllStylists: () => ({ data: allStylists(), isLoading: false, isError: false }),
  };
});

type QueryState<T> = { data?: T; isLoading: boolean; isError: boolean; refetch: () => void };
let hoursQuery: QueryState<SalonHours>;
const refetchHours = vi.fn();
let daysOff: StylistDayOff[] = [];
vi.mock('../data/salonSettings', () => ({
  useSalonHours: () => hoursQuery,
  useClosedDates: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useStylistDaysOff: () => ({ data: daysOff }),
  useSalonInfo: () => ({ data: { whatsapp: null } }),
}));

const setStatus = vi.fn();
let weekBookings: AdminBooking[] = [];
let pendingBookings: AdminBooking[] = [];
let mySalon: { data?: string; isLoading: boolean; isError: boolean; error: unknown; refetch?: () => void } = {
  data: 'elegance', isLoading: false, isError: false, error: null,
};
const rangeCalls: Array<[string, string]> = [];
const DAY_MS = 24 * 60 * 60 * 1000;

vi.mock('../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/admin')>()),
  // The week query spans 6 days; the pending query spans 14 days from today.
  useAdminBookings: (from: Date, to: Date) => (rangeCalls.push([from.toDateString(), to.toDateString()]), {
    data: Math.round((to.getTime() - from.getTime()) / DAY_MS) === 6 ? weekBookings : pendingBookings,
    isLoading: false, isError: false, error: null, refetch: vi.fn(),
  }),
  useMySalon: () => mySalon,
  useMyRole: () => 'owner',
  useSetBookingStatus: () => ({ mutate: setStatus, isPending: false }),
  useCreateStaffBooking: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateStaffBooking: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { LanguageProvider } from '../context/LanguageContext';
import { Schedule } from './Schedule';

function renderSchedule(url = '/admin') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <LanguageProvider>
        <Schedule userId="user-1" />
      </LanguageProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-08T07:00:00Z')); // Tuesday 8 Jan 2030, 08:00 in Algiers
  weekBookings = [];
  pendingBookings = [];
  mySalon = { data: 'elegance', isLoading: false, isError: false, error: null };
  stylistsOverride = undefined;
  hoursQuery = { data: eleganceHours, isLoading: false, isError: false, refetch: refetchHours };
  daysOff = [];
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

describe('Schedule deep link (from a notification)', () => {
  it('deep link to another week opens that booking', () => {
    weekBookings = [adminBooking({ id: 'p9', clientName: 'Nour', startIso: '2030-01-17T09:00:00Z' })];
    renderSchedule('/admin?day=2030-01-17&booking=p9');
    expect(screen.getAllByText('Jeudi 17 janvier').length).toBeGreaterThan(0);
    const dialog = screen.getByRole('dialog', { name: 'Rendez-vous' });
    // It opens on the booking's summary, ready to confirm.
    expect(within(dialog).getByText('Nour')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
  });

  it('unknown booking id just opens the day', () => {
    renderSchedule('/admin?day=2030-01-17&booking=nope');
    expect(screen.getAllByText('Jeudi 17 janvier').length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Schedule — polish', () => {
  it('+ on a closed day opens the next open day', () => {
    renderSchedule();
    fireEvent.click(screen.getByRole('button', { name: 'Jour précédent' })); // Monday 7 Jan: closed
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau rendez-vous' }));
    expect(screen.getByLabelText('Date')).toHaveValue('2030-01-08');
  });

  it('counts waiting bookings for the next 30 days (the owner can move them past 14)', () => {
    rangeCalls.length = 0;
    renderSchedule();
    expect(rangeCalls).toContainEqual([new Date(2030, 0, 8).toDateString(), new Date(2030, 1, 7).toDateString()]);
  });
});

describe('Schedule — salon ownership', () => {
  it('shows only the other-salon message for staff of another salon', () => {
    mySalon = { data: 'rival', isLoading: false, isError: false, error: null };
    renderSchedule();
    expect(screen.getByText('Ce compte appartient à un autre salon.')).toBeInTheDocument();
    expect(screen.queryByText('Amina')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nouveau rendez-vous' })).toBeNull();
  });

  it('shows the schedule for staff of this salon', () => {
    renderSchedule();
    expect(screen.getByText('Amina')).toBeInTheDocument();
    expect(screen.queryByText('Ce compte appartient à un autre salon.')).toBeNull();
  });

  it('shows the not-authorized message when the account is not staff', () => {
    mySalon = { data: undefined, isLoading: false, isError: true, error: { message: 'not_authorized' } };
    renderSchedule();
    expect(screen.getByText('Ce compte n’a pas accès à l’espace salon.')).toBeInTheDocument();
    expect(screen.queryByText('Amina')).toBeNull();
  });

  it('fails closed with a retry when the salon check fails for another reason', () => {
    mySalon = { data: undefined, isLoading: false, isError: true, error: new Error('network'), refetch: vi.fn() };
    renderSchedule();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Amina')).toBeNull();
  });

  it('shows no schedule while the salon is still being checked', () => {
    mySalon = { data: undefined, isLoading: true, isError: false, error: null };
    renderSchedule();
    expect(screen.queryByText('Amina')).toBeNull();
  });
});

describe('Schedule — salon settings', () => {
  const hidden = (id: string) => stylists.map((s) => (s.id === id ? { ...s, active: false } : s));

  it('gives a hidden stylist a column only on a day she has a booking', () => {
    stylistsOverride = hidden('amina');
    weekBookings = [adminBooking({ startIso: '2030-01-09T09:00:00Z' })]; // Amina, Wednesday
    const aminaHeader = () => screen.queryAllByText('Amina').find((el) => el.classList.contains('opacity-60'));
    renderSchedule();
    expect(screen.queryAllByText('Amina')).toHaveLength(0); // Tuesday: no column for her
    expect(screen.getByRole('button', { name: 'Leila 11:00' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Jour suivant' }));
    expect(aminaHeader()).toBeDefined(); // her (greyed) column, holding her booking
  });

  it('shows the loading state, not a closed week, while the hours load', () => {
    hoursQuery = { data: undefined, isLoading: true, isError: false, refetch: refetchHours };
    renderSchedule();
    expect(screen.queryByText('Fermé')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Mardi 8/ })).toBeNull();
    expect(screen.queryByText('Amina')).toBeNull();
  });

  it('offers a retry, not a closed week, when the hours fail to load', () => {
    hoursQuery = { data: undefined, isLoading: false, isError: true, refetch: refetchHours };
    renderSchedule();
    expect(screen.queryByText('Fermé')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refetchHours).toHaveBeenCalled();
  });

  it('+ starts with a stylist who works that day', () => {
    daysOff = [{ id: 'o1', stylistId: 'amina', from: '2030-01-08', to: '2030-01-08' }];
    renderSchedule();
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau rendez-vous' }));
    expect(screen.getByLabelText('Styliste')).toHaveValue('leila');
  });
});
