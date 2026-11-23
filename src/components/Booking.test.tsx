import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup, waitFor, act } from '@testing-library/react';

const service = {
  id: 'coupe-femme', category: 'hair', icon: 'scissors', image: '', price: 2500, duration: 60,
  name: { fr: 'Coupe & Brushing', ar: 'قص' }, description: { fr: 'd', ar: 'd' }, active: true, sortOrder: 0,
};
const coloration = {
  ...service, id: 'coloration', sortOrder: 1, price: 6000, duration: 120,
  name: { fr: 'Coloration & Balayage', ar: 'صبغة' },
};
const manucure = {
  ...service, id: 'manucure', sortOrder: 3, price: 2000, duration: 45,
  name: { fr: 'Manucure & Vernis', ar: 'مانيكير' },
};
const threeServices = [service, coloration, manucure];

const stylist = (id: string, name: string, serviceIds: string[]) => ({
  id, name, role: { fr: `Rôle ${name}`, ar: name }, specialties: [], image: '', serviceIds, active: true,
  workdays: [1, 2, 3, 4, 5, 6, 7],
});
const amina = stylist('amina', 'Amina', ['coupe-femme', 'coloration']);
const sara = stylist('sara', 'Sara', ['manucure']);

let serviceList: Record<string, unknown>[] = [service];
let customCategories: Record<string, unknown>[] = [];
const refetchServices = vi.fn();
vi.mock('../data/queries', () => ({
  useCategories: () => ({ data: customCategories, isLoading: false, isError: false }),
  useServices: () => ({ data: serviceList, isLoading: false, isError: false, refetch: refetchServices }),
  useCatalogue: () => ({ data: serviceList }),
  useStylists: () => ({ data: [amina, sara], isLoading: false, isError: false, refetch: vi.fn() }),
}));

let hours: SalonHours;
let salonInfo: { whatsapp: string | null; address?: { fr: string; ar: string }; city?: { fr: string; ar: string } } = { whatsapp: '0561234567' };
let closed: ClosedDates[] = [];
let hoursState: { isLoading?: boolean; isError?: boolean } = {};
const refetchHours = vi.fn();

vi.mock('../data/salonSettings', () => ({
  useSalonHours: () => ({ data: hoursState.isError || hoursState.isLoading ? undefined : hours, refetch: refetchHours, ...hoursState }),
  useClosedDates: () => ({ data: closed }),
  useSalonInfo: () => ({ data: salonInfo }),
}));

const mutate = vi.fn();
let pending = false;
/** The slots per number of parts (default: 10:00 free); every call's items are recorded. */
const DEFAULT_SLOTS: VisitSlot[] = [{ slot: '10:00', available: true, missing: [] }];
let visitSlots: Record<number, VisitSlot[]> = {};
let slotCalls: VisitItem[][] = [];
/** The slots query is re-fetching (its data is then the cached, possibly stale, answer). */
let slotsFetching = false;
/** Per-day answers (key: Date.toDateString()), for the first-open-day tests. */
let slotsByDay: Record<string, VisitSlot[]> = {};
vi.mock('../data/bookings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/bookings')>()),
  useVisitSlots: (date: Date | null, items: VisitItem[]) => {
    slotCalls.push(items);
    return {
      data: (date && slotsByDay[date.toDateString()]) ?? visitSlots[items.length] ?? DEFAULT_SLOTS,
      isLoading: false, isError: false, isFetching: slotsFetching, refetch: vi.fn(),
    };
  },
  useCreateVisit: () => ({ mutate, reset: vi.fn(), isPending: pending }),
}));

import { eleganceHours } from './admin/fixtures';
import { toYmd } from '../data/bookings';
import { isoWeekday } from '../data/hours';
import type { ClosedDates, SalonHours } from '../data/types';
import type { VisitItem, VisitSlot } from '../data/bookings';
import { LanguageProvider, useLang, translations } from '../context/LanguageContext';
import { Booking } from './Booking';
import { useInPageLinks } from '../lib/useInPageLinks';
import { BookingIntentProvider, useBookingIntent } from '../context/BookingIntentContext';

function ToArabic() {
  const { toggleLang } = useLang();
  return <button onClick={toggleLang}>to-ar</button>;
}

function goToConfirmStep(fill = true) {
  const { container } = render(
    <LanguageProvider>
      <ToArabic />
      <Booking />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByText('Coupe & Brushing'));
  fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
  fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
  const firstDay = container.querySelector('.overflow-x-auto button') as HTMLButtonElement;
  fireEvent.click(firstDay);
  fireEvent.click(screen.getByRole('button', { name: '10:00' }));
  fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
  if (!fill) return;
  fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Yasmine' } });
  fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '0555 12 34 56' } });
}

function Chooser({ id }: { id: string }) {
  const { chooseService } = useBookingIntent();
  return <button onClick={() => chooseService(id)}>choose-{id}</button>;
}

const SUCCESS_PARTS = [{ bookingId: 'b1', serviceId: 'coupe-femme', stylistId: 'amina', startsAt: new Date() }];

function failWith(message: string, details?: string) {
  mutate.mockImplementation((_input, opts: { onError: (e: unknown) => void }) => opts.onError({ message, details }));
}

beforeEach(() => {
  vi.clearAllMocks();
  hours = eleganceHours;
  closed = [];
  hoursState = {};
  serviceList = [service];
  pending = false;
  visitSlots = {};
  slotCalls = [];
  slotsFetching = false;
  slotsByDay = {};
  salonInfo = { whatsapp: '0561234567' };
  localStorage.clear();
});

/** The next date (within the 14-day strip, after today) on the given ISO weekday. */
function nextOn(weekday: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  do d.setDate(d.getDate() + 1);
  while (isoWeekday(d) !== weekday);
  return d;
}

function renderStrip() {
  const { container } = render(
    <LanguageProvider>
      <Booking />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByText('Coupe & Brushing'));
  fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
  fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
  return Array.from(container.querySelectorAll('.overflow-x-auto button')).map((b) => b.textContent ?? '');
}

const stripLabel = (d: Date) => d.getDate().toString();

describe('Booking date strip follows the salon settings', () => {
  it('skips a date inside a closed range', () => {
    const tuesday = nextOn(2);
    const before = renderStrip();
    expect(before.some((l) => l.includes(stripLabel(tuesday)))).toBe(true);
    cleanup();
    closed = [{ id: 'c', from: toYmd(tuesday), to: toYmd(tuesday), label: null }];
    const after = renderStrip();
    expect(after.length).toBe(before.length - 1);
  });

  it('lists the next Sunday when the salon opens on Sundays', () => {
    const base = renderStrip().length;
    cleanup();
    hours = { ...eleganceHours, 7: { opens: 600, closes: 840 } };
    expect(renderStrip().length).toBeGreaterThan(base);
  });

  it('shows an error with retry instead of an empty strip when hours fail to load', () => {
    hoursState = { isError: true };
    render(
      <LanguageProvider>
        <Booking />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refetchHours).toHaveBeenCalled();
  });
});

describe('Booking confirm errors', () => {
  it('slot_taken returns to the time step with a notice', async () => {
    failWith('slot_taken', 'item:0');
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('vient d’être pris');
    expect(screen.queryByRole('button', { name: /Confirmer la réservation/ })).toBeNull();
  });

  it('outside_hours (slot passed while confirming) returns to the time step instead of a dead-end retry', async () => {
    failWith('outside_hours');
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('n’est plus disponible');
    expect(screen.queryByRole('button', { name: /Confirmer la réservation/ })).toBeNull();
    expect(within(screen.getByRole('button', { name: '10:00' })).queryByText('10:00')).not.toBeNull();
  });
});

describe('Booking success screen', () => {
  it('success screen promises a WhatsApp confirmation from the salon', async () => {
    mutate.mockImplementation((_input, opts: { onSuccess: (r: unknown) => void }) =>
      opts.onSuccess([{ bookingId: 'b1', serviceId: 'coupe-femme', stylistId: 'amina', startsAt: new Date() }])
    );
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    expect(await screen.findByText('Le salon vous confirmera votre rendez-vous sur WhatsApp.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envoyer sur WhatsApp' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Une question ? Écrivez-nous sur WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/213561234567'
    );
  });
});

describe('Booking client details validation', () => {
  it('sends the trimmed name and the phone as typed', async () => {
    goToConfirmStep();
    fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: ' Yasmine ' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0]).toMatchObject({
      items: [{ serviceId: 'coupe-femme', stylistId: null }], time: '10:00', clientName: 'Yasmine', clientPhone: '0555 12 34 56', lang: 'fr',
    });
  });

  it('keeps the button enabled and shows every error, focusing the name', async () => {
    goToConfirmStep(false);
    const confirm = screen.getByRole('button', { name: /Confirmer la réservation/ });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(await screen.findByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Le numéro est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('2 champs à corriger.')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Votre nom')).toHaveFocus();
    expect(screen.getByLabelText('Votre nom')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Votre téléphone')).toHaveAttribute('aria-invalid', 'true');
  });

  it('a server invalid_phone lands on the phone field, not in the general alert', async () => {
    failWith('invalid_phone');
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(screen.getByLabelText('Votre téléphone')).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('Numéro de mobile algérien invalide (ex. 0555 12 34 56).')).toBeInTheDocument();
    expect(screen.queryByText('Numéro invalide. Exemple : 0555 12 34 56')).toBeNull();
  });

  it('a server invalid_name lands on the name field', async () => {
    failWith('invalid_name');
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(screen.getByLabelText('Votre nom')).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('Le nom doit contenir 2 à 80 caractères.')).toBeInTheDocument();
  });

  it('in Arabic shows the Arabic phone error and keeps the phone input LTR', async () => {
    goToConfirmStep();
    fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '021 12 34 56' } });
    fireEvent.click(screen.getByText('to-ar'));
    fireEvent.click(screen.getByRole('button', { name: translations.ar['booking.confirm'] }));
    expect(await screen.findByText(translations.ar['form.error.phone'])).toBeInTheDocument();
    expect(screen.getByLabelText(translations.ar['booking.clientPhone'])).toHaveAttribute('dir', 'ltr');
  });
});

describe('Booking step 0 grouping', () => {
  const mk = (id: string, category: string, fr: string) => ({ ...service, id, category, name: { fr, ar: fr } });
  const header = (name: string | RegExp) => screen.getByRole('button', { name });
  const headers = () => screen.queryAllByRole('heading', { level: 4 }).filter((h) => h.querySelector('button[aria-expanded]'));

  beforeEach(() => {
    customCategories = [];
  });

  it('lists the categories as sections, only the largest open', () => {
    serviceList = [mk('s1', 'spa', 'Hammam'), mk('s2', 'coiffure', 'Coupe'), mk('s5', 'coiffure', 'Brushing'), mk('s3', 'beaute', 'Ongles')];
    render(<LanguageProvider><Booking /></LanguageProvider>);
    expect(headers().map((h) => h.querySelector('button')!.textContent)).toEqual([
      expect.stringContaining('Coiffure'), expect.stringContaining('Beauté'), expect.stringContaining('Spa & hammam'),
    ]);
    expect(header(/^Coiffure/)).toHaveAttribute('aria-expanded', 'true');
    expect(header(/^Beauté/)).toHaveAttribute('aria-expanded', 'false');
    expect(serviceButton('Coupe')).toBeInTheDocument();
    expect(screen.queryByText('Hammam')).toBeNull();
    // Opening a second keeps the first open.
    fireEvent.click(header(/^Spa/));
    expect(header(/^Spa/)).toHaveAttribute('aria-expanded', 'true');
    expect(header(/^Coiffure/)).toHaveAttribute('aria-expanded', 'true');
    expect(serviceButton('Hammam')).toBeInTheDocument();
    expect(serviceButton('Coupe')).toBeInTheDocument();
    // The panel id is valid for the header's aria-controls.
    expect(document.getElementById(header(/^Spa/).getAttribute('aria-controls')!)).not.toBeNull();
  });

  it('keeps ticks across closing and opening and shows how many are ticked', () => {
    serviceList = [mk('s1', 'spa', 'Hammam'), mk('s2', 'coiffure', 'Coupe'), mk('s4', 'coiffure', 'Brushing'), mk('s3', 'beaute', 'Ongles')];
    render(<LanguageProvider><Booking /></LanguageProvider>);
    fireEvent.click(serviceButton('Coupe'));
    fireEvent.click(serviceButton('Brushing'));
    fireEvent.click(header(/^Spa/));
    fireEvent.click(serviceButton('Hammam'));
    expect(header('Coiffure, 2 prestations (2 choisies)')).toBeInTheDocument();
    expect(header('Spa & hammam, 1 prestation (1 choisie)')).toBeInTheDocument();
    expect(header('Beauté, 1 prestation')).toBeInTheDocument();
    expect(screen.getByText(/^3 prestations · /)).toBeInTheDocument();
    fireEvent.click(header(/^Coiffure/));
    expect(screen.queryByText('Coupe')).toBeNull();
    fireEvent.click(header(/^Coiffure/));
    expect(serviceButton('Coupe')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(serviceButton('Coupe'));
    expect(header('Coiffure, 2 prestations (1 choisie)')).toBeInTheDocument();
  });

  it('a row is compact: no photo, no description; a pack names what it includes', () => {
    serviceList = [{ ...mk('s1', 'coiffure', 'Coupe'), image: 'https://x/y.jpg', description: { fr: 'Une description longue', ar: 'x' } }];
    render(<LanguageProvider><Booking /></LanguageProvider>);
    expect(serviceButton('Coupe').querySelector('img')).toBeNull();
    expect(screen.queryByText('Une description longue')).toBeNull();
  });

  it('a service tile from another category opens its section when the client goes back', () => {
    serviceList = [mk('s1', 'spa', 'Hammam'), mk('s2', 'coiffure', 'Coupe')];
    render(<LanguageProvider><BookingIntentProvider><Chooser id="s1" /><Booking /></BookingIntentProvider></LanguageProvider>);
    fireEvent.click(screen.getByText('choose-s1'));
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    expect(header(/^Spa/)).toHaveAttribute('aria-expanded', 'true');
    expect(serviceButton('Hammam')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no header buttons with a single category', () => {
    serviceList = [mk('s1', 'coiffure', 'Coupe')];
    render(<LanguageProvider><Booking /></LanguageProvider>);
    expect(screen.queryByRole('button', { name: /^Coiffure/ })).toBeNull();
    expect(headers()).toHaveLength(0);
    expect(serviceButton('Coupe')).toBeInTheDocument();
  });

  it("shows the owner's category as a section after the ready-made ones", () => {
    customCategories = [{ id: 'c-1', name: { fr: 'Mariage', ar: 'زفاف' }, sortOrder: 1 }];
    serviceList = [{ ...mk('s1', 'custom', 'Chignon'), customCategoryId: 'c-1' }, mk('s2', 'coiffure', 'Coupe'), mk('s3', 'spa', 'Hammam')];
    render(<LanguageProvider><Booking /></LanguageProvider>);
    expect(headers().map((h) => h.textContent)).toEqual([
      expect.stringContaining('Coiffure'), expect.stringContaining('Spa'), expect.stringContaining('Mariage'),
    ]);
    fireEvent.click(header(/^Mariage/));
    expect(serviceButton('Chignon')).toBeInTheDocument();
    expect(document.getElementById(header(/^Mariage/).getAttribute('aria-controls')!)).not.toBeNull();
  });
});

describe('Booking a single-service salon', () => {
  it('hides the "choose several" hint only when one service is offered', () => {
    serviceList = [service];
    const { unmount } = render(<LanguageProvider><Booking /></LanguageProvider>);
    expect(screen.queryByText(/Vous pouvez en choisir plusieurs/)).toBeNull();
    unmount();
    serviceList = threeServices;
    render(<LanguageProvider><Booking /></LanguageProvider>);
    expect(screen.getByText(/Vous pouvez en choisir plusieurs/)).toBeInTheDocument();
  });

  it('stylist buttons of a single service expose aria-pressed', () => {
    serviceList = [service];
    render(<LanguageProvider><Booking /></LanguageProvider>);
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    expect(screen.getByRole('button', { name: 'Sans préférence' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Amina/ })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Booking intent from a service tile', () => {
  it('selects the requested service and opens the stylist step', () => {
    serviceList = threeServices;
    render(<LanguageProvider><BookingIntentProvider><Chooser id="coupe-femme" /><Booking /></BookingIntentProvider></LanguageProvider>);
    expect(screen.queryByText('Choisissez votre coiffeuse')).toBeNull();
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    expect(screen.getByText('Choisissez votre coiffeuse')).toBeInTheDocument();
    // Back on the service step, it is ticked and another can be added.
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    expect(serviceButton('Coupe & Brushing')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(serviceButton('Manucure & Vernis'));
    expect(serviceButton('Coupe & Brushing')).toHaveAttribute('aria-pressed', 'true');
    expect(serviceButton('Manucure & Vernis')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('2 prestations · 4 500 DA · 105 min')).toBeInTheDocument();
  });

  it('ignores an unknown service', () => {
    render(<LanguageProvider><BookingIntentProvider><Chooser id="nope" /><Booking /></BookingIntentProvider></LanguageProvider>);
    fireEvent.click(screen.getByText('choose-nope'));
    expect(screen.queryByText('Choisissez votre coiffeuse')).toBeNull();
  });

  it('applies a request made before the services load', () => {
    serviceList = [];
    const ui = () => (
      <LanguageProvider><BookingIntentProvider><Chooser id="coupe-femme" /><Booking /></BookingIntentProvider></LanguageProvider>
    );
    const { rerender } = render(ui());
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    expect(screen.queryByText('Choisissez votre coiffeuse')).toBeNull();
    serviceList = [service];
    rerender(ui());
    expect(screen.getByText('Choisissez votre coiffeuse')).toBeInTheDocument();
  });

  const other = { ...service, id: 'soin', name: { fr: 'Soin visage', ar: 'س' } };
  const ui = () => (
    <LanguageProvider>
      <BookingIntentProvider><Chooser id="coupe-femme" /><Chooser id="soin" /><Booking /></BookingIntentProvider>
    </LanguageProvider>
  );

  it('brings a later step back to the stylist step with the new service, also for the same one again', () => {
    serviceList = [service, other];
    render(ui());
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    expect(screen.queryByText('Choisissez votre coiffeuse')).toBeNull();
    fireEvent.click(screen.getByText('choose-soin'));
    expect(screen.getByText('Choisissez votre coiffeuse')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeEnabled();
    expect(serviceButton('Soin visage')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.click(screen.getByText('choose-soin'));
    expect(screen.getByText('Choisissez votre coiffeuse')).toBeInTheDocument();
  });

  it('starts over from the success screen', async () => {
    mutate.mockImplementation((_i, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(SUCCESS_PARTS));
    render(ui());
    fireEvent.click(screen.getByText('Coupe & Brushing'));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.click(document.body.querySelector('.overflow-x-auto button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Yasmine' } });
    fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '0555 12 34 56' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await screen.findByText('Le salon vous confirmera votre rendez-vous sur WhatsApp.');
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    expect(screen.getByText('Choisissez votre coiffeuse')).toBeInTheDocument();
  });

  it('shows a recap of the chosen service on the stylist step and Changer goes back to the service step', () => {
    render(ui());
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    const changer = screen.getByRole('button', { name: 'Changer' });
    const recap = changer.parentElement!;
    expect(recap.textContent).toContain('Coupe & Brushing');
    expect(recap.textContent).toMatch(/2\s?500/);
    expect(recap.textContent).toMatch(/1\s?h|60/);
    fireEvent.click(changer);
    expect(screen.getByText('Choisissez votre prestation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changer' })).toBeNull();
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeEnabled();
  });

  const toConfirm = () => {
    fireEvent.click(screen.getByText('Coupe & Brushing'));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.click(document.body.querySelector('.overflow-x-auto button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
  };
  const fillClient = () => {
    fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Yasmine' } });
    fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '0555 12 34 56' } });
  };
  const SUCCESS = 'Le salon vous confirmera votre rendez-vous sur WhatsApp.';

  it('drops a request made while a booking is sent: the success screen stays', async () => {
    let done: ((r: unknown) => void) | undefined;
    mutate.mockImplementation((_i, opts: { onSuccess: (r: unknown) => void }) => { done = opts.onSuccess; });
    const { rerender } = render(ui());
    toConfirm();
    fillClient();
    pending = true;
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(done).toBeDefined());
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    pending = false;
    act(() => done!(SUCCESS_PARTS));
    rerender(ui());
    expect(await screen.findByText(SUCCESS)).toBeInTheDocument();
  });

  it('drops a request made while a booking is sent and fails: the wizard is unchanged', async () => {
    let fail: ((e: unknown) => void) | undefined;
    mutate.mockImplementation((_i, opts: { onError: (e: unknown) => void }) => { fail = opts.onError; });
    const { rerender } = render(ui());
    toConfirm();
    fillClient();
    pending = true;
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(fail).toBeDefined());
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    pending = false;
    act(() => fail!({ message: 'rate_limited' }));
    rerender(ui());
    expect(screen.queryByText('Choisissez votre coiffeuse')).toBeNull();
    expect(screen.getByLabelText('Votre nom')).toHaveValue('Yasmine');
  });

  it('a tile tapped on the success screen starts a new booking at the stylist step', async () => {
    mutate.mockImplementation((_i, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(SUCCESS_PARTS));
    render(ui());
    toConfirm();
    fillClient();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await screen.findByText(SUCCESS);
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    expect(screen.getByText('Choisissez votre coiffeuse')).toBeInTheDocument();
  });

  it('clears stale field errors on a tile restart', async () => {
    failWith('invalid_phone');
    render(ui());
    toConfirm();
    fillClient();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(screen.getByLabelText('Votre téléphone')).toHaveAttribute('aria-invalid', 'true'));
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.click(document.body.querySelector('.overflow-x-auto button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    expect(screen.getByLabelText('Votre téléphone')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Votre nom')).toHaveValue('Yasmine');
  });

  it('does not leave the focus flag set when the wizard is already on the stylist step', () => {
    render(ui());
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    (document.activeElement as HTMLElement).blur();
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps the typed name and phone, clears stylist/date/time, when a tile restarts the wizard', () => {
    render(ui());
    fireEvent.click(screen.getByText('Coupe & Brushing'));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.click(document.body.querySelector('.overflow-x-auto button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Yasmine' } });
    fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '0555 12 34 56' } });
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    expect(screen.getByText('Choisissez votre coiffeuse')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByText('Choisissez votre coiffeuse'));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    // The date step reopens on the first open day, but the time chosen before is gone.
    expect(selectedChips()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
    fireEvent.click(document.body.querySelector('.overflow-x-auto button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    expect(screen.getByLabelText('Votre nom')).toHaveValue('Yasmine');
    expect(screen.getByLabelText('Votre téléphone')).toHaveValue('0555 12 34 56');
  });

  it('puts focus on the service heading after Changer', () => {
    render(ui());
    fireEvent.click(screen.getByText('choose-coupe-femme'));
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }));
    expect(document.activeElement).toBe(screen.getByText('Choisissez votre prestation'));
  });
});

/** The service toggle on step 0. */
function serviceButton(name: string): HTMLElement {
  return screen.getByText(name).closest('button') as HTMLElement;
}

const wizard = () => (
  <LanguageProvider>
    <ToArabic />
    <Booking />
  </LanguageProvider>
);
function renderWizard() {
  return render(wizard());
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
const pickFirstDay = () => fireEvent.click(document.body.querySelector('.overflow-x-auto button') as HTMLButtonElement);
/** The row of the staff step for a service (its heading's group). */
const staffRow = (name: string) => within(screen.getByRole('group', { name }));
const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
/** Algiers is UTC+1 all year: 09:00Z is 10:00 at the salon. */
const BOOKED_TWO = [
  { bookingId: 'b1', serviceId: 'coupe-femme', stylistId: 'amina', startsAt: new Date('2026-11-18T09:00:00Z') },
  { bookingId: 'b2', serviceId: 'manucure', stylistId: 'sara', startsAt: new Date('2026-11-18T10:00:00Z') },
];
const isSelectedChip = (el: Element) => el.classList.contains('chip-selected');
const selectedChips = () => screen.queryAllByRole('button').filter(isSelectedChip);
const recapText = () => textOf(screen.getByRole('button', { name: 'Changer' }).parentElement!.querySelector('p')!);
const fillAndConfirm = () => {
  fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Yasmine' } });
  fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '0555 12 34 56' } });
  fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
};

describe('Booking several services', () => {
  beforeEach(() => {
    serviceList = threeServices;
  });

  it('ticks several services and sums them in the summary bar', () => {
    renderWizard();
    fireEvent.click(serviceButton('Coloration & Balayage'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    expect(serviceButton('Coloration & Balayage')).toHaveAttribute('aria-pressed', 'true');
    expect(serviceButton('Coupe & Brushing')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('2 prestations · 8 500 DA · 180 min')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Continuer/ })).toHaveLength(1);
  });

  it('un-ticking a service removes it', () => {
    renderWizard();
    fireEvent.click(serviceButton('Coupe & Brushing'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    expect(serviceButton('Coupe & Brushing')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
  });

  it('stops at 4 services', () => {
    const extra = (id: string, fr: string, sortOrder: number) => ({ ...service, id, sortOrder, name: { fr, ar: fr } });
    serviceList = [...threeServices, extra('soin', 'Soin visage', 4), extra('epilation', 'Épilation', 5)];
    renderWizard();
    for (const name of ['Coupe & Brushing', 'Coloration & Balayage', 'Manucure & Vernis', 'Soin visage']) {
      fireEvent.click(serviceButton(name));
    }
    const fifth = serviceButton('Épilation');
    expect(fifth).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(fifth);
    expect(fifth).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/^4 prestations · /)).toBeInTheDocument();
    expect(screen.getByText('4 prestations maximum par rendez-vous')).toBeInTheDocument();
  });

  it("one row per service, in the salon's order, on the staff step", () => {
    renderWizard();
    fireEvent.click(serviceButton('Manucure & Vernis'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Coupe & Brushing',
      'Manucure & Vernis',
    ]);
    const coupe = staffRow('Coupe & Brushing');
    expect(coupe.getByRole('button', { name: 'Amina' })).toBeInTheDocument();
    expect(coupe.getByRole('button', { name: 'Sans préférence' })).toBeInTheDocument();
    expect(coupe.queryByRole('button', { name: 'Sara' })).toBeNull();
  });

  it("a single service keeps today's staff grid", () => {
    renderWizard();
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0);
    expect(screen.queryByRole('group', { name: 'Coupe & Brushing' })).toBeNull();
    expect(screen.getByText('Rôle Amina')).toBeInTheDocument();
    expect(screen.getByText('Sans préférence')).toBeInTheDocument();
  });

  it('the recap names every service', () => {
    renderWizard();
    fireEvent.click(serviceButton('Coloration & Balayage'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    const recap = screen.getByRole('button', { name: 'Changer' }).parentElement!;
    expect(textOf(recap.querySelector('p')!)).toBe('Coupe & Brushing + Coloration & Balayage · 8 500 DA · 180 min');
  });

  it('sends the items in visit order with each chosen staff member', async () => {
    renderWizard();
    fireEvent.click(serviceButton('Manucure & Vernis'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    fireEvent.click(staffRow('Coupe & Brushing').getByRole('button', { name: 'Amina' }));
    next();
    pickFirstDay();
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    next();
    fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Yasmine' } });
    fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '0555 12 34 56' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].items).toEqual([
      { serviceId: 'coupe-femme', stylistId: 'amina' },
      { serviceId: 'manucure', stylistId: null },
    ]);
  });

  const toTime = () => {
    renderWizard();
    fireEvent.click(serviceButton('Manucure & Vernis'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    fireEvent.click(staffRow('Coupe & Brushing').getByRole('button', { name: 'Amina' }));
    next();
    pickFirstDay();
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
  };

  it('shows the plan after a time is chosen', () => {
    toTime();
    const plan = screen.getByRole('region', { name: 'Déroulé' });
    expect(within(plan).getAllByRole('listitem').map(textOf)).toEqual([
      '10:00 Coupe & Brushing · Amina',
      '11:00 Manucure & Vernis · sans préférence',
    ]);
  });

  it('the confirm step and success screen list each part and the total', async () => {
    mutate.mockImplementation((_i, opts: { onSuccess: (r: unknown) => void }) =>
      opts.onSuccess(BOOKED_TWO)
    );
    toTime();
    next();
    const parts = screen.getAllByRole('listitem').map(textOf);
    expect(parts).toEqual(['10:00 Coupe & Brushing · Amina', '11:00 Manucure & Vernis · sans préférence']);
    expect(textOf(screen.getByText('Total').parentElement!)).toBe('Total 4 500 DA');
    fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Yasmine' } });
    fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '0555 12 34 56' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await screen.findByText('Le salon vous confirmera votre rendez-vous sur WhatsApp.');
    expect(screen.getAllByRole('listitem').map(textOf)).toEqual([
      '10:00 Coupe & Brushing · Amina',
      '11:00 Manucure & Vernis · Sara',
    ]);
    expect(textOf(screen.getByText('Total').parentElement!)).toBe('Total 4 500 DA');
  });

  it('the success screen keeps the parts as booked when the services change afterwards', async () => {
    mutate.mockImplementation((_i, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(BOOKED_TWO));
    const { rerender } = render(wizard());
    fireEvent.click(serviceButton('Manucure & Vernis'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    next();
    pickFirstDay();
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    next();
    fillAndConfirm();
    await screen.findByText('Le salon vous confirmera votre rendez-vous sur WhatsApp.');
    serviceList = [{ ...service, name: { fr: 'Coupe renommée', ar: 'x' }, price: 9999 }];
    rerender(wizard());
    expect(screen.getAllByRole('listitem').map(textOf)).toEqual([
      '10:00 Coupe & Brushing · Amina',
      '11:00 Manucure & Vernis · Sara',
    ]);
    expect(textOf(screen.getByText('Total').parentElement!)).toBe('Total 4 500 DA');
  });

  it('the success screen shows the times the salon booked', async () => {
    mutate.mockImplementation((_i, opts: { onSuccess: (r: unknown) => void }) =>
      opts.onSuccess([{ ...BOOKED_TWO[0], startsAt: new Date('2026-11-18T09:30:00Z') }, BOOKED_TWO[1]])
    );
    toTime();
    next();
    fillAndConfirm();
    await screen.findByText('Le salon vous confirmera votre rendez-vous sur WhatsApp.');
    expect(screen.getAllByRole('listitem').map(textOf)[0]).toBe('10:30 Coupe & Brushing · Amina');
  });

  it('changing a staff choice clears the chosen time', () => {
    toTime();
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    fireEvent.click(staffRow('Coupe & Brushing').getByRole('button', { name: 'Sans préférence' }));
    next();
    expect(selectedChips()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
  });

  it('changing the services clears the chosen time', () => {
    toTime();
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }));
    fireEvent.click(serviceButton('Coloration & Balayage'));
    next();
    next();
    expect(selectedChips()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
  });

  it('unticking a service drops its staff choice', () => {
    renderWizard();
    fireEvent.click(serviceButton('Manucure & Vernis'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    fireEvent.click(staffRow('Coupe & Brushing').getByRole('button', { name: 'Amina' }));
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    expect(staffRow('Coupe & Brushing').getByRole('button', { name: 'Sans préférence' })).toHaveAttribute('aria-pressed', 'true');
    expect(staffRow('Coupe & Brushing').getByRole('button', { name: 'Amina' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the live summary region rendered (empty, not hidden) before any choice', () => {
    const { container } = renderWizard();
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toBeEmptyDOMElement();
    expect(live!.className).not.toMatch(/(^|\s)(hidden|empty:hidden)(\s|$)/);
    fireEvent.click(serviceButton('Coupe & Brushing'));
    expect(live).toHaveTextContent('1 prestation');
  });

  it('a selected service that is no longer offered is dropped with a note and the time cleared', () => {
    const { rerender } = render(wizard());
    fireEvent.click(serviceButton('Manucure & Vernis'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    next();
    pickFirstDay();
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    serviceList = [service, coloration];
    rerender(wizard());
    expect(screen.getByText('Une prestation n’est plus proposée et a été retirée.')).toBeInTheDocument();
    expect(recapText()).toMatch(/^Coupe & Brushing · /);
    expect(selectedChips()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
  });

  describe('bringing the plan into view after a time is picked', () => {
    let calls: [Element, ScrollIntoViewOptions | undefined][];
    const original = Element.prototype.scrollIntoView;
    const originalMatch = window.matchMedia;
    beforeEach(() => {
      calls = [];
      Element.prototype.scrollIntoView = function (this: Element, o?: boolean | ScrollIntoViewOptions) {
        // Only the plan's own scroll: each step change also brings the booking card's top into view.
        // (the booking card's top on step changes, and the chosen day in the date strip, are other scrolls)
        if (!(this as Element).hasAttribute('data-booking-top') && !(this as Element).hasAttribute('aria-pressed')) calls.push([this, o as ScrollIntoViewOptions]);
      };
    });
    afterEach(() => {
      Element.prototype.scrollIntoView = original;
      window.matchMedia = originalMatch;
    });

    it('scrolls the plan into view smoothly without moving the focus', () => {
      toTime();
      const plan = screen.getByRole('region', { name: 'Déroulé' });
      expect(calls).toEqual([[plan, { block: 'nearest', behavior: 'smooth' }]]);
      expect(document.activeElement).toBe(document.body);
    });

    it('jumps without animation when the client prefers reduced motion', () => {
      window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') })) as unknown as typeof window.matchMedia;
      toTime();
      expect(calls[0][1]).toEqual({ block: 'nearest', behavior: 'auto' });
    });
  });
});

const slot = (time: string, available: boolean, missing: number[]): VisitSlot => ({ slot: time, available, missing });

describe('Booking unavailable parts', () => {
  beforeEach(() => {
    serviceList = threeServices;
  });

  /** Coupe (Amina unless told otherwise) + Manucure, on the time step of the first day. */
  const toTimes = (amina = true) => {
    const result = renderWizard();
    fireEvent.click(serviceButton('Manucure & Vernis'));
    fireEvent.click(serviceButton('Coupe & Brushing'));
    next();
    if (amina) fireEvent.click(staffRow('Coupe & Brushing').getByRole('button', { name: 'Amina' }));
    next();
    pickFirstDay();
    return result;
  };
  const partialChip = () => screen.getByRole('button', { name: /10:00.*sans Manucure & Vernis/ });

  it('a part missing all day gets a message with Retirer and Changer de coiffeuse', () => {
    visitSlots[2] = [slot('09:00', false, [0, 1]), slot('10:00', false, [1]), slot('11:00', false, [1])];
    toTimes();
    const item = screen.getByText('Manucure & Vernis n’est pas disponible ce jour-là').closest('li')!;
    expect(within(item).getByRole('button', { name: 'Retirer cette prestation' })).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: 'Changer de coiffeuse' })).toBeNull();
    cleanup();

    visitSlots[2] = [slot('09:00', false, [0]), slot('10:00', false, [0, 1])];
    toTimes();
    const withAmina = screen.getByText('Coupe & Brushing n’est pas disponible avec Amina ce jour-là').closest('li')!;
    fireEvent.click(within(withAmina).getByRole('button', { name: 'Changer de coiffeuse' }));
    expect(document.activeElement).toBe(screen.getByText('Choisissez votre coiffeuse'));
  });

  it('Retirer removes the part and re-fetches for the rest', () => {
    visitSlots[2] = [slot('09:00', false, [0, 1]), slot('10:00', false, [1])];
    toTimes();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer cette prestation' }));
    expect(recapText()).toMatch(/^Coupe & Brushing · /);
    expect(slotCalls.at(-1)).toEqual([{ serviceId: 'coupe-femme', stylistId: 'amina' }]);
  });

  it('a time with some parts missing is a third state, not full', () => {
    visitSlots[2] = [slot('10:00', false, [1]), slot('11:00', false, [0, 1])];
    toTimes();
    expect(partialChip()).toHaveClass('chip-partial');
    expect(partialChip()).toBeEnabled();
    const full = screen.getByRole('button', { name: '11:00' });
    expect(full).toHaveClass('chip-disabled');
    expect(full).toBeDisabled();
  });

  it('tapping it explains and offers both choices', () => {
    visitSlots[2] = [slot('10:00', false, [1]), slot('11:00', false, [0, 1])];
    toTimes();
    fireEvent.click(partialChip());
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('Manucure & Vernis n’est pas disponible à 10:00');
    expect(notice.querySelector('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'Réserver les autres prestations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Choisir une autre heure' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(selectedChips()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
  });

  it('Réserver les autres prestations keeps the time when it is still free', () => {
    visitSlots[2] = [slot('10:00', false, [1])];
    visitSlots[1] = [slot('10:00', true, [])];
    toTimes();
    fireEvent.click(partialChip());
    fireEvent.click(screen.getByRole('button', { name: 'Réserver les autres prestations' }));
    expect(recapText()).toMatch(/^Coupe & Brushing · /);
    expect(screen.getByRole('button', { name: '10:00' })).toHaveClass('chip-selected');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeEnabled();
  });

  it('bookOthers clears a time that is not available after re-placement', () => {
    visitSlots[2] = [slot('10:00', false, [1])];
    visitSlots[1] = [slot('10:00', false, [0])];
    toTimes();
    fireEvent.click(partialChip());
    fireEvent.click(screen.getByRole('button', { name: 'Réserver les autres prestations' }));
    expect(selectedChips()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
  });

  const raceToConfirm = async () => {
    failWith('slot_taken', 'item:1');
    toTimes();
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    next();
    fillAndConfirm();
    return screen.findByRole('alert');
  };

  it('a confirm race names the part and offers the same choice', async () => {
    const alert = await raceToConfirm();
    expect(alert).toHaveTextContent('Manucure & Vernis vient d’être réservée à cette heure');
    expect(alert.querySelector('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Réserver les autres prestations' }));
    expect(screen.getByText('Choisissez une date')).toBeInTheDocument();
    expect(slotCalls.at(-1)).toHaveLength(1);
    expect(recapText()).toMatch(/^Coupe & Brushing · /);
    expect(screen.getByRole('button', { name: '10:00' })).toHaveClass('chip-selected');
    cleanup();

    const again = await raceToConfirm();
    expect(again).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choisir une autre heure' }));
    expect(screen.getByText('Choisissez une date')).toBeInTheDocument();
    expect(slotCalls.at(-1)).toHaveLength(2);
    expect(selectedChips()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
  });

  it('a services reorder while the notice is open does not change which service it names or removes', () => {
    visitSlots[2] = [slot('10:00', false, [1])];
    visitSlots[1] = [slot('10:00', true, [])];
    const { rerender } = toTimes();
    fireEvent.click(partialChip());
    expect(screen.getByRole('alert')).toHaveTextContent('Manucure & Vernis n’est pas disponible à 10:00');
    serviceList = [{ ...manucure, sortOrder: -1 }, service, coloration];
    rerender(wizard());
    expect(screen.getByRole('alert')).toHaveTextContent('Manucure & Vernis n’est pas disponible à 10:00');
    fireEvent.click(screen.getByRole('button', { name: 'Réserver les autres prestations' }));
    expect(recapText()).toMatch(/^Coupe & Brushing · /);
  });

  it('the day-level message is announced politely', () => {
    visitSlots[2] = [slot('09:00', false, [0, 1]), slot('10:00', false, [1])];
    toTimes();
    expect(screen.getByText('Manucure & Vernis n’est pas disponible ce jour-là').closest('ul')).toHaveAttribute('role', 'status');
  });

  it('in Arabic the notices are Arabic and use logical alignment', () => {
    visitSlots[2] = [slot('09:00', false, [0, 1]), slot('10:00', false, [1])];
    toTimes();
    fireEvent.click(screen.getByText('to-ar'));
    expect(screen.getByRole('button', { name: /10:00.*بدون/ })).toHaveClass('chip-partial');
    const day = screen.getByText(/غير متاحة في هذا اليوم/);
    expect(day.closest('ul')).toHaveClass('text-start');
  });

  it('a part missing all day is not repeated on the chips, but stays in their accessible name', () => {
    visitSlots[2] = [slot('09:00', false, [0, 1]), slot('10:00', false, [1])];
    toTimes();
    const chip = partialChip();
    expect(chip).toHaveClass('chip-partial');
    const visible = Array.from(chip.querySelectorAll('span')).filter((el) => !el.classList.contains('sr-only'));
    expect(visible.map((el) => el.textContent ?? '').join('')).not.toContain('sans');
    fireEvent.click(chip);
    expect(screen.getByRole('alert')).toHaveTextContent('Manucure & Vernis n’est pas disponible à 10:00');
  });

  it('a part missing only at some times still shows "sans X" on the chip', () => {
    visitSlots[2] = [slot('10:00', false, [1]), slot('11:00', true, [])];
    toTimes();
    const visible = Array.from(partialChip().querySelectorAll('span')).filter((el) => !el.classList.contains('sr-only'));
    expect(visible.map((el) => el.textContent).join('')).toBe('sans Manucure & Vernis');
  });

  it('a stale cached answer neither enables Continuer nor clears the kept time while re-fetching', () => {
    visitSlots[2] = [slot('10:00', false, [1])];
    visitSlots[1] = [slot('10:00', false, [0]), slot('11:00', true, [])];
    slotsFetching = true;
    const { rerender } = toTimes();
    fireEvent.click(partialChip());
    fireEvent.click(screen.getByRole('button', { name: 'Réserver les autres prestations' }));
    expect(screen.getByRole('button', { name: '10:00' })).toHaveClass('chip-selected');
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
    visitSlots[1] = [slot('10:00', true, [])];
    slotsFetching = false;
    rerender(wizard());
    expect(screen.getByRole('button', { name: '10:00' })).toHaveClass('chip-selected');
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeEnabled();
  });
});

describe('Booking on the client page (look and navigation)', () => {
  it('the navigation is never sticky', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /Continuer/ }).closest('.sticky')).toBeNull();
    expect(document.querySelector('[data-fade], [data-fade-room]')).toBeNull();
  });

  it('shows no Retour on the first step, and Retour from the second', () => {
    renderWizard();
    expect(screen.queryByRole('button', { name: /Retour/ })).toBeNull();
    fireEvent.click(screen.getByText(service.name.fr));
    next();
    expect(screen.getByRole('button', { name: /Retour/ })).toBeInTheDocument();
  });

  it('says which step this is in words instead of icon circles', () => {
    renderWizard();
    expect(screen.getByText('Étape 1 sur 4 — Service')).toBeInTheDocument();
    fireEvent.click(screen.getByText(service.name.fr));
    next();
    expect(screen.getByText('Étape 2 sur 4 — Coiffeuse')).toBeInTheDocument();
  });

  it('the primary action is full width on phones', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /Continuer/ })).toHaveClass('w-full', 'sm:w-auto');
  });

  it('service rows are compact: no icon tile, no photo even when the service has one', () => {
    serviceList = [service, { ...service, id: 'soin', image: 'https://x.test/soin.jpg', name: { fr: 'Soin visage', ar: 'س' } }];
    renderWizard();
    const plain = screen.getByText(service.name.fr).closest('button')!;
    expect(plain.querySelector('svg')).toBeNull();
    expect(plain.querySelector('img')).toBeNull();
    const withPhoto = screen.getByText('Soin visage').closest('button')!;
    expect(withPhoto.querySelector('img')).toBeNull();
  });
});

describe('Booking comfort', () => {
  const dayButtons = () => [...document.body.querySelectorAll('.overflow-x-auto button')] as HTMLButtonElement[];
  const pressedDay = () => dayButtons().findIndex((b) => b.getAttribute('aria-pressed') === 'true');
  const toDateStep = () => {
    fireEvent.click(screen.getByText(service.name.fr));
    next();
    next();
  };

  it('scrolls the booking card into view on each step change, not on first render', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderWizard();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(service.name.fr));
    next();
    expect(spy).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect((spy.mock.contexts.at(-1) as HTMLElement).hasAttribute('data-booking-top')).toBe(true);
    spy.mockRestore();
  });

  it('scrolls instantly under reduced motion', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderWizard();
    fireEvent.click(screen.getByText(service.name.fr));
    next();
    expect(spy).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    spy.mockRestore();
    window.matchMedia = original;
  });

  it('the back button goes to the previous step', async () => {
    renderWizard();
    fireEvent.click(screen.getByText(service.name.fr));
    next();
    expect(screen.getByText('Choisissez votre coiffeuse')).toBeInTheDocument();
    act(() => history.back());
    expect(await screen.findByText('Choisissez votre prestation')).toBeInTheDocument();
  });

  it('on the first step the back button is not intercepted', () => {
    const push = vi.spyOn(history, 'pushState');
    renderWizard();
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it('after booking the back button is not intercepted', async () => {
    mutate.mockImplementation((_input, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(SUCCESS_PARTS));
    goToConfirmStep();
    const back = vi.spyOn(history, 'back');
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await screen.findByText('Le salon vous confirmera votre rendez-vous sur WhatsApp.');
    // The success screen releases the wizard's history guard, so the next back press leaves the page.
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    back.mockRestore();
  });

  it('opens the date step on the first open day', () => {
    renderWizard();
    toDateStep();
    expect(pressedDay()).toBe(0);
    expect(screen.getByRole('button', { name: '10:00' })).toBeInTheDocument();
  });

  it('moves to the next open day when the first has no free time', async () => {
    renderWizard();
    fireEvent.click(screen.getByText(service.name.fr));
    next();
    const first = upcomingOpenDays()[0];
    slotsByDay = { [first.toDateString()]: [{ slot: '09:00', available: false, missing: [] }] };
    next();
    await waitFor(() => expect(pressedDay()).toBe(1));
  });

  it('stops auto-advancing at the last open day', async () => {
    const days = upcomingOpenDays();
    slotsByDay = Object.fromEntries(days.map((d) => [d.toDateString(), []]));
    renderWizard();
    toDateStep();
    await waitFor(() => expect(pressedDay()).toBe(days.length - 1));
    expect(screen.getByText('Aucun créneau disponible pour cette date')).toBeInTheDocument();
  });

  it('a tapped day is never changed automatically', async () => {
    renderWizard();
    toDateStep();
    const second = upcomingOpenDays()[1];
    slotsByDay = { [second.toDateString()]: [] };
    fireEvent.click(dayButtons()[1]);
    await new Promise((r) => setTimeout(r, 20));
    expect(pressedDay()).toBe(1);
  });

  it('prefills the confirm step for a remembered client and Effacer clears it', () => {
    localStorage.setItem('salon:elegance:client', JSON.stringify({ name: 'Nadia', phone: '0555123456' }));
    goToConfirmStep(false);
    expect(screen.getByLabelText('Votre nom')).toHaveValue('Nadia');
    expect(screen.getByLabelText('Votre téléphone')).toHaveValue('0555123456');
    fireEvent.click(screen.getByRole('button', { name: 'Ce n’est pas vous ? Effacer' }));
    expect(screen.getByLabelText('Votre nom')).toHaveValue('');
    expect(localStorage.getItem('salon:elegance:client')).toBeNull();
  });

  it('saves the client after a successful booking', async () => {
    mutate.mockImplementation((_input, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(SUCCESS_PARTS));
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await screen.findByText('Le salon vous confirmera votre rendez-vous sur WhatsApp.');
    expect(JSON.parse(localStorage.getItem('salon:elegance:client')!)).toEqual({ name: 'Yasmine', phone: '0555123456' });
  });

  it('shows the WhatsApp question line only when the salon has WhatsApp', () => {
    const { unmount } = renderWizard();
    expect(screen.getByRole('link', { name: 'Une question ? Écrivez-nous sur WhatsApp' })).toHaveAttribute('href', 'https://wa.me/213561234567');
    unmount();
    salonInfo = { whatsapp: null };
    renderWizard();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).toBeNull();
  });

  const bookIt = async () => {
    salonInfo = { whatsapp: '0561234567', address: { fr: '12 Rue Didouche Mourad', ar: 'x' }, city: { fr: 'Alger', ar: 'x' } };
    mutate.mockImplementation((_input, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(SUCCESS_PARTS));
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
  };

  it('the success screen offers Google Agenda first, the calendar file as another agenda, and Itinéraire', async () => {
    await bookIt();
    const google = await screen.findByRole('link', { name: 'Ajouter à Google Agenda' });
    const url = new URL(google.getAttribute('href')!);
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('text')).toMatch(/^Élégance — .+ \(à confirmer\)$/);
    expect(url.searchParams.get('location')).toBe('12 Rue Didouche Mourad, Alger');
    expect(google).toHaveAttribute('target', '_blank');
    const other = screen.getByRole('link', { name: 'Autre agenda' });
    expect(other.getAttribute('href')).toMatch(/^\/calendar\.ics\?d=\d{4}-\d{2}-\d{2}&t=\d{2}%3A\d{2}&s=[^&]+&l=fr$/);
    expect(other).not.toHaveAttribute('download');
    expect(screen.getByRole('link', { name: 'Itinéraire' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('12 Rue Didouche Mourad, Alger')
    );
  });

  it('on an iPhone the calendar file comes first (Safari opens it in Add to Calendar), Google Agenda second', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    try {
      await bookIt();
      const file = await screen.findByRole('link', { name: 'Ajouter à mon agenda' });
      expect(file.getAttribute('href')).toMatch(/^\/calendar\.ics\?/);
      expect(file).not.toHaveAttribute('target');
      expect(screen.getByRole('link', { name: 'Google Agenda' }).getAttribute('href')).toMatch(/^https:\/\/calendar\.google\.com\//);
    } finally {
      ua.mockRestore();
    }
  });
});

describe('Booking comfort after review', () => {
  it('scrolls an automatically chosen day into view in the date strip', async () => {
    const days = upcomingOpenDays();
    slotsByDay = Object.fromEntries(days.slice(0, 6).map((d) => [d.toDateString(), []]));
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderWizard();
    fireEvent.click(screen.getByText(service.name.fr));
    next();
    next();
    await waitFor(() => expect(document.querySelector('.overflow-x-auto button[aria-pressed="true"]')).toBe(
      document.querySelectorAll('.overflow-x-auto button')[6]
    ));
    const calls = spy.mock.calls.filter((_, k) => (spy.mock.contexts[k] as Element).getAttribute('aria-pressed') === 'true');
    expect(calls.at(-1)?.[0]).toEqual({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    spy.mockRestore();
  });

  it('a tap on an in-page link mid-booking does not break the back-button guard', async () => {
    mutate.mockImplementation((_input, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(SUCCESS_PARTS));
    render(<LanguageProvider><InPageLinks /><a href="#home">to-home</a><Booking /></LanguageProvider>);
    fireEvent.click(screen.getByText('Coupe & Brushing'));
    next();
    fireEvent.click(screen.getByText('to-home'));
    expect(history.state?.bookingGuard).toBe(true);
    next();
    fireEvent.click(document.body.querySelector('.overflow-x-auto button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    next();
    fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Yasmine' } });
    fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '0555 12 34 56' } });
    const back = vi.spyOn(history, 'back');
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await screen.findByText('Le salon vous confirmera votre rendez-vous sur WhatsApp.');
    await waitFor(() => expect(back).toHaveBeenCalledTimes(1));
    back.mockRestore();
  });
});

function InPageLinks() {
  useInPageLinks();
  return null;
}

describe('Booking success screen comes into view', () => {
  it('the browser does not restore old scroll positions while the booking is on the page', () => {
    history.scrollRestoration = 'auto';
    const { unmount } = renderWizard();
    expect(history.scrollRestoration).toBe('manual');
    unmount();
    expect(history.scrollRestoration).toBe('auto');
  });

  it('scrolls the success screen into view after confirming', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    mutate.mockImplementation((_input, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(SUCCESS_PARTS));
    goToConfirmStep();
    spy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await screen.findByText('Le salon vous confirmera votre rendez-vous sur WhatsApp.');
    expect(spy).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect((spy.mock.contexts.at(-1) as HTMLElement).id).toBe('booking');
    spy.mockRestore();
  });
});

/** The open days the strip lists (Élégance: Tuesday–Saturday), in order. */
function upcomingOpenDays(): Date[] {
  const out: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (eleganceHours[isoWeekday(d)]) out.push(d);
  }
  return out;
}

describe('Booking packs and promotions', () => {
  const pack = {
    ...service, id: 'pack-mariee', category: 'pack', sortOrder: 9, price: 9000, duration: 150,
    name: { fr: 'Pack Mariée', ar: 'باقة' }, includes: ['coupe-femme', 'coloration'], packStylistId: 'amina', promo: null,
  };
  const withDefaults = (s: Record<string, unknown>) => ({ includes: [], packStylistId: null, promo: null, ...s });

  beforeEach(() => {
    serviceList = [...threeServices.map(withDefaults), pack];
  });

  const openSection = (name: string) => {
    const h = screen.getByRole('button', { name: new RegExp(`^${name}`) });
    if (h.getAttribute('aria-expanded') !== 'true') fireEvent.click(h);
  };

  it('shows the Packs section first but opens the larger category; a pack lists what it includes', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /^Packs/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /^Coiffure/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('Pack Mariée')).toBeNull();
    openSection('Packs');
    expect(serviceButton('Pack Mariée').textContent).toContain('Comprend : Coupe & Brushing, Coloration & Balayage');
  });

  it('a pack alone skips the stylist step and Retour comes back to services', () => {
    renderWizard();
    openSection('Packs');
    fireEvent.click(serviceButton('Pack Mariée'));
    next();
    expect(screen.getByText('Choisissez une date')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    expect(screen.getByText('Choisissez votre prestation')).toBeInTheDocument();
  });

  it('a pack with a service shows only the service in the stylist step', () => {
    renderWizard();
    openSection('Packs');
    fireEvent.click(serviceButton('Pack Mariée'));
    openSection('Coiffure');
    fireEvent.click(serviceButton('Manucure & Vernis'));
    next();
    expect(screen.getByText('Choisissez votre coiffeuse')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Pack Mariée' })).toBeNull();
    expect(screen.getByText('Rôle Sara')).toBeInTheDocument();
    expect(screen.queryByText('Rôle Amina')).toBeNull();
  });

  it('a running promo shows the crossed regular price and the effective total', () => {
    serviceList = [withDefaults({ ...service, promo: { price: 1500, from: '2000-01-01', to: '2999-12-31' } })];
    renderWizard();
    const btn = serviceButton('Coupe & Brushing');
    expect(btn.querySelector('.line-through')!.textContent).toMatch(/2\s?500/);
    fireEvent.click(btn);
    expect(screen.getByText('1 prestation · 1 500 DA · 60 min')).toBeInTheDocument();
  });

  it('sends the total it showed', async () => {
    serviceList = [withDefaults({ ...service, promo: { price: 1500, from: '2000-01-01', to: '2999-12-31' } })];
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].expectedTotal).toBe(1500);
  });

  it('price_changed refreshes prices and stays on the confirm step', async () => {
    serviceList = [withDefaults(service)];
    refetchServices.mockImplementation(() => {
      serviceList = [withDefaults({ ...service, promo: { price: 1500, from: '2000-01-01', to: '2999-12-31' } })];
    });
    failWith('price_changed');
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le prix vient de changer');
    expect(refetchServices).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Confirmer la réservation/ })).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/1\s?500/);
  });

  it('price_changed with the server total: shows it and books at it on the next tap (a wrong device clock)', async () => {
    serviceList = [withDefaults(service)];
    refetchServices.mockReset(); // the device's prices stay as they are
    failWith('price_changed', 'total:2000');
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Le prix vient de changer');
    // the summary's price is the server's (below the price: shown as a promotion)
    expect(document.body.textContent).toMatch(/Prix2\s?000\sDA au lieu de 2\s?500\sDA/);
    mutate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].expectedTotal).toBe(2000);
  });

  it('the server total is forgotten when the visit changes', async () => {
    serviceList = [withDefaults(service)];
    refetchServices.mockReset(); // the device's prices stay as they are
    failWith('price_changed', 'total:2000');
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await screen.findByRole('alert');
    // another time: the server's total was for the other visit
    visitSlots = { 1: [...DEFAULT_SLOTS, { slot: '11:00', available: true, missing: [] }] };
    fireEvent.click(screen.getByRole('button', { name: /Retour/ }));
    fireEvent.click(screen.getByRole('button', { name: '11:00' }));
    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    expect(document.body.textContent).toMatch(/Prix2\s?500\sDA(?! au lieu)/);
    mutate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0][0].expectedTotal).toBe(2500);
  });
});
