import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup, waitFor } from '@testing-library/react';

const service = {
  id: 'coupe-femme', category: 'hair', icon: 'scissors', image: '', price: 2500, duration: 60,
  name: { fr: 'Coupe & Brushing', ar: 'قص' }, description: { fr: 'd', ar: 'd' }, active: true,
};

vi.mock('../data/queries', () => ({
  useServices: () => ({ data: [service], isLoading: false, isError: false, refetch: vi.fn() }),
  useStylists: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
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
vi.mock('../data/bookings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/bookings')>()),
  useSlots: () => ({ data: [{ slot: '10:00', available: true }], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateBooking: () => ({ mutate, reset: vi.fn(), isPending: false }),
}));

import { eleganceHours } from './admin/fixtures';
import { toYmd } from '../data/bookings';
import { isoWeekday } from '../data/hours';
import type { ClosedDates, SalonHours } from '../data/types';
import { LanguageProvider, useLang, translations } from '../context/LanguageContext';
import { Booking } from './Booking';

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

function failWith(message: string) {
  mutate.mockImplementation((_input, opts: { onError: (e: unknown) => void }) => opts.onError({ message }));
}

beforeEach(() => {
  vi.clearAllMocks();
  hours = eleganceHours;
  closed = [];
  hoursState = {};
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
      opts.onSuccess({ bookingId: 'b1', stylistId: 'amina' })
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
      serviceId: 'coupe-femme', time: '10:00', clientName: 'Yasmine', clientPhone: '0555 12 34 56', lang: 'fr',
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

  it('in Arabic shows the Arabic phone error and keeps the phone input LTR', async () => {
    goToConfirmStep();
    fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '021 12 34 56' } });
    fireEvent.click(screen.getByText('to-ar'));
    fireEvent.click(screen.getByRole('button', { name: translations.ar['booking.confirm'] }));
    expect(await screen.findByText(translations.ar['form.error.phone'])).toBeInTheDocument();
    expect(screen.getByLabelText(translations.ar['booking.clientPhone'])).toHaveAttribute('dir', 'ltr');
  });
});
