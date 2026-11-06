import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { services, stylists, adminBooking } from './fixtures';

vi.mock('../../data/queries', async () => {
  const f = await import('./fixtures');
  return {
    useServices: () => ({ data: f.services, isLoading: false, isError: false }),
    useStylists: () => ({ data: f.stylists, isLoading: false, isError: false }),
  };
});

const create = vi.fn();
const update = vi.fn();
const setStatus = vi.fn();
let pending = false;
vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useCreateStaffBooking: () => ({ mutate: create, isPending: pending }),
  useUpdateStaffBooking: () => ({ mutate: update, isPending: pending }),
  useSetBookingStatus: () => ({ mutate: setStatus, isPending: pending }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { BookingSheet, type SheetState } from './BookingSheet';

const tuesday = new Date(2030, 0, 8);
const addState: SheetState = { mode: 'add', stylistId: 'sara', date: tuesday, time: '10:00' };

function renderSheet(state: SheetState, onClose = vi.fn()) {
  render(
    <LanguageProvider>
      <BookingSheet state={state} onClose={onClose} />
    </LanguageProvider>
  );
  return onClose;
}

function fillClient(name: string, phone: string) {
  fireEvent.change(screen.getByLabelText('Nom de la cliente'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: phone } });
}

function whatsappText(): string {
  const href = screen.getByRole('link', { name: /Envoyer sur WhatsApp/ }).getAttribute('href')!;
  return decodeURIComponent(href.split('?text=')[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  pending = false;
});

describe('BookingSheet — add', () => {
  it('add prefills stylist, date and time and lists every service', () => {
    renderSheet(addState);
    expect(screen.getByRole('dialog', { name: 'Nouveau rendez-vous' })).toBeInTheDocument();
    expect(screen.getByLabelText('Styliste')).toHaveValue('sara');
    expect(screen.getByLabelText('Date')).toHaveValue('2030-01-08');
    expect(screen.getByLabelText('Heure')).toHaveValue('10:00');
    const serviceSelect = screen.getByLabelText('Prestation');
    for (const s of services) {
      expect(within(serviceSelect).getByRole('option', { name: s.name.fr })).toBeInTheDocument();
    }
    expect(stylists).toHaveLength(3);
  });

  it('add sends a staff booking', () => {
    renderSheet(addState);
    fillClient('Rania', '0555 12 34 56');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(create).toHaveBeenCalledWith(
      {
        serviceId: 'coupe-femme', stylistId: 'sara', date: tuesday, time: '10:00',
        clientName: 'Rania', clientPhone: '0555 12 34 56', lang: 'fr',
      },
      expect.anything()
    );
  });

  it('invalid phone blocks save', () => {
    renderSheet(addState);
    fillClient('Rania', '021 12 34 56');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Numéro de mobile algérien invalide.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows slot_taken message and keeps the sheet open', () => {
    create.mockImplementation((_input, opts) => opts.onError({ message: 'slot_taken' }));
    const onClose = renderSheet(addState);
    fillClient('Rania', '0555123456');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Cette styliste a déjà un rendez-vous à cette heure.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom de la cliente')).toHaveValue('Rania');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes after a successful add', () => {
    create.mockImplementation((_input, opts) => opts.onSuccess('new-id'));
    const onClose = renderSheet(addState);
    fillClient('Rania', '0555123456');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('save disabled while pending', () => {
    pending = true;
    renderSheet(addState);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });
});

describe('BookingSheet — edit', () => {
  it("confirm offers WhatsApp reply in the client's language", () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: adminBooking({ lang: 'ar', status: 'pending' }) });
    expect(screen.getByRole('dialog', { name: 'Rendez-vous' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer/ }));
    expect(setStatus).toHaveBeenCalledWith({ id: 'b1', status: 'confirmed' }, expect.anything());
    const link = screen.getByRole('link', { name: /Envoyer sur WhatsApp/ });
    expect(link.getAttribute('href')!.startsWith('https://wa.me/213555123456?text=')).toBe(true);
    expect(whatsappText()).toContain('تم تأكيد موعدكِ');
  });

  it('cancelling asks first, then offers the cancellation message', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: adminBooking({ status: 'confirmed' }) });
    expect(screen.queryByRole('button', { name: /Confirmer/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Annuler/ }));
    expect(setStatus).toHaveBeenCalledWith({ id: 'b1', status: 'cancelled' }, expect.anything());
    expect(whatsappText()).toContain('est annulé');
  });

  it('moving offers the moved message', () => {
    update.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: adminBooking() });
    fireEvent.change(screen.getByLabelText('Heure'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', time: '11:00' }), expect.anything());
    expect(whatsappText()).toContain('a été déplacé au Mardi 8 janvier à 11:00');
  });

  it('confirm and cancel are disabled while there are unsaved changes', () => {
    renderSheet({ mode: 'edit', booking: adminBooking({ status: 'pending' }) });
    fireEvent.change(screen.getByLabelText('Heure'), { target: { value: '11:00' } });
    expect(screen.getByRole('button', { name: /Confirmer/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Annuler/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Heure'), { target: { value: '10:00' } });
    expect(screen.getByRole('button', { name: /Confirmer/ })).toBeEnabled();
  });

  it('a name-only edit just closes', () => {
    update.mockImplementation((_input, opts) => opts.onSuccess());
    const onClose = renderSheet({ mode: 'edit', booking: adminBooking() });
    fireEvent.change(screen.getByLabelText('Nom de la cliente'), { target: { value: 'Yasmine B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Envoyer sur WhatsApp/ })).toBeNull();
  });
});
