import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const service = {
  id: 'coupe-femme', category: 'hair', icon: 'scissors', image: '', price: 2500, duration: 60,
  name: { fr: 'Coupe & Brushing', ar: 'قص' }, description: { fr: 'd', ar: 'd' }, active: true,
};

vi.mock('../data/queries', () => ({
  useServices: () => ({ data: [service], isLoading: false, isError: false, refetch: vi.fn() }),
  useStylists: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('../data/salonSettings', async () => {
  const f = await import('./admin/fixtures');
  return {
    useSalonHours: () => ({ data: f.eleganceHours }),
    useClosedDates: () => ({ data: [] }),
    useSalonInfo: () => ({ data: { whatsapp: '0561234567' } }),
  };
});

const mutate = vi.fn();
vi.mock('../data/bookings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/bookings')>()),
  useSlots: () => ({ data: [{ slot: '10:00', available: true }], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateBooking: () => ({ mutate, reset: vi.fn(), isPending: false }),
}));

import { LanguageProvider } from '../context/LanguageContext';
import { Booking } from './Booking';

function goToConfirmStep() {
  const { container } = render(
    <LanguageProvider>
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
  fireEvent.change(screen.getByLabelText('Votre nom'), { target: { value: 'Yasmine' } });
  fireEvent.change(screen.getByLabelText('Votre téléphone'), { target: { value: '0555 12 34 56' } });
}

function failWith(message: string) {
  mutate.mockImplementation((_input, opts: { onError: (e: unknown) => void }) => opts.onError({ message }));
}

beforeEach(() => vi.clearAllMocks());

describe('Booking confirm errors', () => {
  it('slot_taken returns to the time step with a notice', () => {
    failWith('slot_taken');
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('vient d’être pris');
    expect(screen.queryByRole('button', { name: /Confirmer la réservation/ })).toBeNull();
  });

  it('outside_hours (slot passed while confirming) returns to the time step instead of a dead-end retry', () => {
    failWith('outside_hours');
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('n’est plus disponible');
    expect(screen.queryByRole('button', { name: /Confirmer la réservation/ })).toBeNull();
    expect(within(screen.getByRole('button', { name: '10:00' })).queryByText('10:00')).not.toBeNull();
  });
});

describe('Booking success screen', () => {
  it('success screen promises a WhatsApp confirmation from the salon', () => {
    mutate.mockImplementation((_input, opts: { onSuccess: (r: unknown) => void }) =>
      opts.onSuccess({ bookingId: 'b1', stylistId: 'amina' })
    );
    goToConfirmStep();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/ }));
    expect(screen.getByText('Le salon vous confirmera votre rendez-vous sur WhatsApp.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Envoyer sur WhatsApp' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Une question ? Écrivez-nous sur WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/213561234567'
    );
  });
});
