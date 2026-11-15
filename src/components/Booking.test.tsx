import { describe, it, expect, vi, beforeEach } from 'vitest';
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

let serviceList: (typeof service)[] = [service];
vi.mock('../data/queries', () => ({
  useServices: () => ({ data: serviceList, isLoading: false, isError: false, refetch: vi.fn() }),
  useStylists: () => ({ data: [amina, sara], isLoading: false, isError: false, refetch: vi.fn() }),
}));

let hours: SalonHours;
let closed: ClosedDates[] = [];
let hoursState: { isLoading?: boolean; isError?: boolean } = {};
const refetchHours = vi.fn();

vi.mock('../data/salonSettings', () => ({
  useSalonHours: () => ({ data: hoursState.isError || hoursState.isLoading ? undefined : hours, refetch: refetchHours, ...hoursState }),
  useClosedDates: () => ({ data: closed }),
  useSalonInfo: () => ({ data: { whatsapp: '0561234567' } }),
}));

const mutate = vi.fn();
let pending = false;
vi.mock('../data/bookings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/bookings')>()),
  useVisitSlots: () => ({
    data: [{ slot: '10:00', available: true, missing: [] }], isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useCreateVisit: () => ({ mutate, reset: vi.fn(), isPending: pending }),
}));

import { eleganceHours } from './admin/fixtures';
import { toYmd } from '../data/bookings';
import { isoWeekday } from '../data/hours';
import type { ClosedDates, SalonHours } from '../data/types';
import { LanguageProvider, useLang, translations } from '../context/LanguageContext';
import { Booking } from './Booking';
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

function failWith(message: string) {
  mutate.mockImplementation((_input, opts: { onError: (e: unknown) => void }) => opts.onError({ message }));
}

beforeEach(() => {
  vi.clearAllMocks();
  hours = eleganceHours;
  closed = [];
  hoursState = {};
  serviceList = [service];
  pending = false;
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
    failWith('slot_taken');
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

  it('groups services under category headings when several categories are present', () => {
    serviceList = [mk('s1', 'spa', 'Hammam'), mk('s2', 'coiffure', 'Coupe'), mk('s3', 'beaute', 'Ongles')];
    render(<LanguageProvider><Booking /></LanguageProvider>);
    const headings = screen.getAllByRole('heading', { level: 4 }).filter((h) => ['Coiffure', 'Beauté', 'Spa'].includes(h.textContent ?? ''));
    expect(headings.map((h) => h.textContent)).toEqual(['Coiffure', 'Beauté', 'Spa']);
    const group = (i: number) => within(headings[i].parentElement!);
    expect(group(0).getByText('Coupe')).toBeInTheDocument();
    expect(group(0).queryByText('Hammam')).toBeNull();
    expect(group(1).getByText('Ongles')).toBeInTheDocument();
    expect(group(2).getByText('Hammam')).toBeInTheDocument();
    // Service names sit one level under their group heading.
    expect(group(2).getByRole('heading', { level: 5, name: 'Hammam' })).toBeInTheDocument();
  });

  it('shows no heading with a single category', () => {
    serviceList = [mk('s1', 'coiffure', 'Coupe')];
    render(<LanguageProvider><Booking /></LanguageProvider>);
    expect(screen.queryByRole('heading', { name: 'Coiffure' })).toBeNull();
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
    expect(screen.getByText('Soin visage').closest('button')?.className).toContain('ring-gold-300');
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
    expect(screen.queryByRole('button', { name: '10:00' })).toBeNull();
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

function renderWizard() {
  return render(
    <LanguageProvider>
      <Booking />
    </LanguageProvider>
  );
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /Continuer/ }));
const pickFirstDay = () => fireEvent.click(document.body.querySelector('.overflow-x-auto button') as HTMLButtonElement);
/** The row of the staff step for a service (its heading's group). */
const staffRow = (name: string) => within(screen.getByRole('group', { name }));
const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

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
      opts.onSuccess([
        { bookingId: 'b1', serviceId: 'coupe-femme', stylistId: 'amina', startsAt: new Date() },
        { bookingId: 'b2', serviceId: 'manucure', stylistId: 'sara', startsAt: new Date() },
      ])
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
});
