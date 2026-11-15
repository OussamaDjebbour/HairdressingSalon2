import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { groupVisits, type AdminBooking } from '../../data/admin';
import { adminBooking } from './fixtures';

let salonWhatsapp: string | null = '0555 00 11 22';
vi.mock('../../data/salonSettings', () => ({
  useSalonInfo: () => ({ data: { whatsapp: salonWhatsapp } }),
}));

const setStatus = vi.fn();
let role: 'owner' | 'demo' = 'owner';
vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useSetBookingStatus: () => ({ mutate: setStatus, isPending: false }),
  useMyRole: () => role,
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { FeedbackProvider } from './feedback';
import { PendingSheet, type Answered } from './PendingSheet';

// Now: Tuesday 8 Jan 2030, 08:00 in Algiers.
const nour = adminBooking({
  id: 'p1', clientName: 'Nour K.', clientPhone: '0661223344', startIso: '2030-01-11T13:00:00Z',
  createdAt: new Date('2030-01-08T05:00:00Z'),
});
const sabrina = adminBooking({
  id: 'p2', clientName: 'Sabrina T.', clientPhone: '0770112233', startIso: '2030-01-09T09:00:00Z',
  createdAt: new Date('2030-01-08T06:30:00Z'),
});

/** Schedule keeps the answered rows (so they survive opening a booking); the harness plays that part. */
function Harness({ bookings, onOpen, onClose }: { bookings: AdminBooking[]; onOpen(b: AdminBooking): void; onClose(): void }) {
  const [answered, setAnswered] = useState<Answered[]>([]);
  return (
    <PendingSheet
      visits={groupVisits(bookings)}
      answered={answered}
      onAnswered={(a) => setAnswered((list) => [...list, a])}
      onOpen={onOpen}
      onClose={onClose}
    />
  );
}

function renderSheet(bookings: AdminBooking[], onOpen = vi.fn(), onClose = vi.fn()) {
  const view = render(
    <LanguageProvider><FeedbackProvider>
      <Harness bookings={bookings} onOpen={onOpen} onClose={onClose} />
    </FeedbackProvider></LanguageProvider>
  );
  return {
    onOpen,
    onClose,
    rerender: (next: AdminBooking[]) =>
      view.rerender(
        <LanguageProvider><FeedbackProvider>
          <Harness bookings={next} onOpen={onOpen} onClose={onClose} />
        </FeedbackProvider></LanguageProvider>
      ),
  };
}

const twoParts = [
  adminBooking({
    id: 'v1a', visitId: 'v1', clientName: 'Lina M.', clientPhone: '0661223344', startIso: '2030-01-11T13:00:00Z',
    price: 2500, createdAt: new Date('2030-01-08T05:00:00Z'),
  }),
  adminBooking({
    id: 'v1b', visitId: 'v1', clientName: 'Lina M.', clientPhone: '0661223344', startIso: '2030-01-11T14:00:00Z',
    price: 6000, serviceId: 'manucure', serviceName: { fr: 'Manucure', ar: 'مانيكير' },
    stylistId: 'leila', stylistName: 'Leila', createdAt: new Date('2030-01-08T05:00:00Z'),
  }),
];

const cards = () => screen.getAllByRole('listitem');

/** Answers "Annuler ce rendez-vous ?" with `choice`, and waits for the dialog to close. */
async function answerCancel(choice: 'Oui, annuler' | 'Garder le rendez-vous') {
  const dialog = await screen.findByRole('alertdialog', { name: 'Annuler ce rendez-vous ?' });
  fireEvent.click(within(dialog).getByRole('button', { name: choice }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
  role = 'owner';
  salonWhatsapp = '0555 00 11 22';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-08T07:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('PendingSheet', () => {
  it('lists waiting bookings, oldest request first', () => {
    renderSheet([sabrina, nour]);
    expect(screen.getByRole('dialog', { name: '2 réservations à confirmer' })).toBeInTheDocument();
    expect(within(cards()[0]).getByText('Nour K.')).toBeInTheDocument();
    expect(within(cards()[1]).getByText('Sabrina T.')).toBeInTheDocument();
    expect(within(cards()[0]).getByText('il y a 2 h')).toBeInTheDocument();
    expect(within(cards()[0]).getByText('14:00')).toBeInTheDocument();
  });

  it('one card per visit, listing its parts and the total', () => {
    renderSheet(twoParts);
    expect(cards()).toHaveLength(1);
    const card = cards()[0];
    expect(within(card).getByText(/Coupe & Brushing/)).toBeInTheDocument();
    expect(within(card).getByText(/Manucure/)).toBeInTheDocument();
    expect(within(card).getByText(/Amina/)).toBeInTheDocument();
    expect(within(card).getByText(/Leila/)).toBeInTheDocument();
    expect(card).toHaveTextContent('8 500 DA');
    expect(within(card).getAllByRole('button', { name: 'Confirmer' })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: '1 réservation à confirmer' })).toBeInTheDocument();
  });

  it('a part on another day carries its date in the card', () => {
    renderSheet([twoParts[0], { ...twoParts[1], startsAt: new Date('2030-01-12T09:00:00Z'), endsAt: new Date('2030-01-12T10:00:00Z') }]);
    expect(within(cards()[0]).getByText(/Sam 12 janvier/)).toBeInTheDocument();
  });

  it('the WhatsApp message of a multi-part visit names every service', () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet(twoParts);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    const text = decodeURIComponent(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')!.split('?text=')[1]);
    expect(text).toContain('Coupe & Brushing + Manucure');
  });

  it('confirming a visit card turns the whole visit green', () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet(twoParts);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith({ id: 'v1a', status: 'confirmed' }, expect.anything());
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('Lina M. confirmée')).toBeInTheDocument();
  });

  it('confirming turns the card into a green row with the WhatsApp message, then says all is done', () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet([nour, sabrina]);
    fireEvent.click(within(cards()[0]).getByRole('button', { name: 'Confirmer' }));
    expect(setStatus).toHaveBeenCalledWith({ id: 'p1', status: 'confirmed' }, expect.anything());
    expect(screen.getByText('Nour K. confirmée')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'WhatsApp' });
    expect(link.getAttribute('href')!.startsWith('https://wa.me/213661223344?text=')).toBe(true);
    expect(decodeURIComponent(link.getAttribute('href')!.split('?text=')[1])).toContain('est confirmé');
    expect(screen.getByRole('heading', { name: '1 réservation à confirmer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('heading', { name: 'Tout est traité.' })).toBeInTheDocument();
    expect(screen.getByText('Sabrina T. confirmée')).toBeInTheDocument();
  });

  it('keeps a confirmed row even when the list it was given no longer has it', () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    const { rerender } = renderSheet([nour]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    rerender([]);
    expect(screen.getByText('Nour K. confirmée')).toBeInTheDocument();
  });

  it('refusing asks first; declining calls nothing', async () => {
    renderSheet([nour]);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    await answerCancel('Garder le rendez-vous');
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('refusing a multi-part request names every service it cancels', async () => {
    renderSheet(twoParts);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Annuler toute la visite ?' });
    expect(dialog).toHaveTextContent('Les 2 prestations seront annulées : Coupe & Brushing + Manucure.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Garder le rendez-vous' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('refusing, once accepted, shows the cancelled row with its message', async () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet([nour]);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    await answerCancel('Oui, annuler');
    expect(setStatus).toHaveBeenCalledWith({ id: 'p1', status: 'cancelled' }, expect.anything());
    expect(screen.getByText('Nour K. annulée')).toBeInTheDocument();
    const href = screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')!;
    expect(decodeURIComponent(href.split('?text=')[1])).toContain('est annulé');
  });

  it('a failed confirm keeps the card and says why', () => {
    setStatus.mockImplementation((_input, opts) => opts.onError({ message: 'slot_taken' }));
    renderSheet([nour]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Cette styliste a déjà un rendez-vous à cette heure.');
    expect(screen.queryByText('Nour K. confirmée')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
  });

  it('does not list a waiting booking whose time has passed', () => {
    renderSheet([nour, adminBooking({ id: 'old', clientName: 'Passée', startIso: '2030-01-07T09:00:00Z' })]);
    expect(screen.queryByText('Passée')).toBeNull();
    expect(screen.getByRole('heading', { name: '1 réservation à confirmer' })).toBeInTheDocument();
  });

  it('tapping the card opens that booking', () => {
    const { onOpen } = renderSheet([nour]);
    fireEvent.click(within(cards()[0]).getByText('Nour K.'));
    expect(onOpen).toHaveBeenCalledWith(nour);
  });

  it('in the demo, the WhatsApp message goes to the salon number', () => {
    role = 'demo';
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet([{ ...nour, clientPhone: '06•• •• •• 44' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')!.startsWith('https://wa.me/213555001122?text=')).toBe(true);
  });

  it('a declined Refuser leaves the error under the card that failed', async () => {
    setStatus.mockImplementationOnce((_input, opts) => opts.onError({ message: 'slot_taken' }));
    renderSheet([nour, sabrina]);
    fireEvent.click(within(cards()[0]).getByRole('button', { name: 'Confirmer' }));
    fireEvent.click(within(cards()[1]).getByRole('button', { name: 'Refuser' }));
    await answerCancel('Garder le rendez-vous');
    expect(within(cards()[0]).getByRole('alert')).toBeInTheDocument();
    expect(within(cards()[1]).queryByRole('alert')).toBeNull();
  });

  it('says "Tout est traité." once every request was answered, refusals included', async () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet([nour]);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    await answerCancel('Oui, annuler');
    expect(screen.getByRole('heading', { name: 'Tout est traité.' })).toBeInTheDocument();
  });

  it('in the demo without a salon number, offers no broken WhatsApp link', () => {
    role = 'demo';
    salonWhatsapp = null;
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet([nour]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByText('Nour K. confirmée')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).toBeNull();
  });

  it("can't open a booking while its answer is being sent", () => {
    setStatus.mockImplementation(() => {}); // never answers: the confirm stays in flight
    renderSheet([nour]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(within(cards()[0]).getAllByRole('button')[0]).toBeDisabled();
  });

  it('lays a client name out in its own direction', () => {
    renderSheet([nour]);
    expect(screen.getByText('Nour K.')).toHaveAttribute('dir', 'auto');
  });

  it('slides away before opening the booking a card was tapped on', () => {
    vi.useRealTimers(); // beforeEach fakes only Date; the slide-away runs on a timer
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-08T07:00:00Z'));
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
    try {
      const { onOpen } = renderSheet([nour]);
      fireEvent.click(within(cards()[0]).getByText('Nour K.'));
      expect(onOpen).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'closing');
      act(() => vi.advanceTimersByTime(250));
      expect(onOpen).toHaveBeenCalledWith(nour);
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });

  it('Escape closes it', () => {
    const { onClose } = renderSheet([nour]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
