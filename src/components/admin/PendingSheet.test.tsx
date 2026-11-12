import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { AdminBooking } from '../../data/admin';
import { adminBooking } from './fixtures';

vi.mock('../../data/salonSettings', () => ({
  useSalonInfo: () => ({ data: { whatsapp: '0555 00 11 22' } }),
}));

const setStatus = vi.fn();
let role: 'owner' | 'demo' = 'owner';
vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useSetBookingStatus: () => ({ mutate: setStatus, isPending: false }),
  useMyRole: () => role,
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { PendingSheet } from './PendingSheet';

// Now: Tuesday 8 Jan 2030, 08:00 in Algiers.
const nour = adminBooking({
  id: 'p1', clientName: 'Nour K.', clientPhone: '0661223344', startIso: '2030-01-11T13:00:00Z',
  createdAt: new Date('2030-01-08T05:00:00Z'),
});
const sabrina = adminBooking({
  id: 'p2', clientName: 'Sabrina T.', clientPhone: '0770112233', startIso: '2030-01-09T09:00:00Z',
  createdAt: new Date('2030-01-08T06:30:00Z'),
});

function renderSheet(bookings: AdminBooking[], onOpen = vi.fn(), onClose = vi.fn()) {
  render(
    <LanguageProvider>
      <PendingSheet bookings={bookings} onOpen={onOpen} onClose={onClose} />
    </LanguageProvider>
  );
  return { onOpen, onClose };
}

const cards = () => screen.getAllByRole('listitem');

beforeEach(() => {
  vi.clearAllMocks();
  role = 'owner';
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
    expect(screen.getByRole('heading', { name: 'Tout est confirmé.' })).toBeInTheDocument();
    expect(screen.getByText('Sabrina T. confirmée')).toBeInTheDocument();
  });

  it('keeps a confirmed row even when the list it was given no longer has it', () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    const { rerender } = render(
      <LanguageProvider>
        <PendingSheet bookings={[nour]} onOpen={vi.fn()} onClose={vi.fn()} />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    rerender(
      <LanguageProvider>
        <PendingSheet bookings={[]} onOpen={vi.fn()} onClose={vi.fn()} />
      </LanguageProvider>
    );
    expect(screen.getByText('Nour K. confirmée')).toBeInTheDocument();
  });

  it('refusing asks first; declining calls nothing', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderSheet([nour]);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    expect(confirm).toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('refusing, once accepted, shows the cancelled row with its message', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet([nour]);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
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

  it('Escape closes it', () => {
    const { onClose } = renderSheet([nour]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
