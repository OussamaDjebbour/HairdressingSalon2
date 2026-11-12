import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { StylistDayOff } from '../../data/types';
import { services, stylists, adminBooking } from './fixtures';

let servicesOverride: typeof services | undefined;
let stylistsOverride: typeof stylists | undefined;
vi.mock('../../data/queries', async () => {
  const f = await import('./fixtures');
  const allServices = () => servicesOverride ?? f.services;
  const allStylists = () => stylistsOverride ?? f.stylists;
  return {
    // The public hooks are active-only; the admin sheet must use the "all" ones.
    useServices: () => ({ data: allServices().filter((s) => s.active), isLoading: false, isError: false }),
    useStylists: () => ({ data: allStylists().filter((s) => s.active), isLoading: false, isError: false }),
    useAllServices: () => ({ data: allServices(), isLoading: false, isError: false }),
    useAllStylists: () => ({ data: allStylists(), isLoading: false, isError: false }),
  };
});

let daysOff: StylistDayOff[] = [];
let salonWhatsapp: string | null = '0555 00 11 22';
vi.mock('../../data/salonSettings', async () => {
  const f = await import('./fixtures');
  return {
    useSalonHours: () => ({ data: f.eleganceHours }),
    useClosedDates: () => ({ data: [] }),
    useStylistDaysOff: () => ({ data: daysOff }),
    useSalonInfo: () => ({ data: { whatsapp: salonWhatsapp } }),
  };
});

const create = vi.fn();
const update = vi.fn();
const setStatus = vi.fn();
let pending = false;
let role: 'owner' | 'demo' | null = 'owner';
vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useCreateStaffBooking: () => ({ mutate: create, isPending: pending }),
  useUpdateStaffBooking: () => ({ mutate: update, isPending: pending }),
  useSetBookingStatus: () => ({ mutate: setStatus, isPending: pending }),
  useMyRole: () => role,
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

/** Existing bookings open on the summary; the form is one tap away. */
function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Modifier ou déplacer' }));
}

function whatsappText(): string {
  const href = screen.getByRole('link', { name: /Envoyer sur WhatsApp/ }).getAttribute('href')!;
  return decodeURIComponent(href.split('?text=')[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  pending = false;
  role = 'owner';
  servicesOverride = undefined;
  stylistsOverride = undefined;
  daysOff = [];
  salonWhatsapp = '0555 00 11 22';
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
    fireEvent.click(screen.getByRole('button', { name: 'Annuler le rendez-vous' }));
    expect(setStatus).toHaveBeenCalledWith({ id: 'b1', status: 'cancelled' }, expect.anything());
    expect(whatsappText()).toContain('est annulé');
  });

  it('moving offers the moved message', () => {
    update.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: adminBooking() });
    openForm();
    fireEvent.change(screen.getByLabelText('Heure'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', time: '11:00' }), expect.anything());
    expect(whatsappText()).toContain('a été déplacé au Mardi 8 janvier à 11:00');
  });

  it('a name-only edit just closes', () => {
    update.mockImplementation((_input, opts) => opts.onSuccess());
    const onClose = renderSheet({ mode: 'edit', booking: adminBooking() });
    openForm();
    fireEvent.change(screen.getByLabelText('Nom de la cliente'), { target: { value: 'Yasmine B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Envoyer sur WhatsApp/ })).toBeNull();
  });
});

describe('BookingSheet — summary first', () => {
  it('opens a waiting website booking as a summary with Confirmer and Refuser, not a form', () => {
    renderSheet({ mode: 'edit', booking: adminBooking({ status: 'pending', source: 'online' }) });
    expect(screen.getByText('À confirmer')).toBeInTheDocument();
    expect(screen.getByText(/via le site/)).toBeInTheDocument();
    expect(screen.getByText('10:00 – 11:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nom de la cliente')).toBeNull();
    expect(screen.getByText('Coupe & Brushing')).toBeInTheDocument();
    expect(screen.getByText('Amina')).toBeInTheDocument();
  });

  it('a confirmed booking offers the WhatsApp message and cancelling', () => {
    renderSheet({ mode: 'edit', booking: adminBooking({ status: 'confirmed' }) });
    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Annuler le rendez-vous' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Message WhatsApp' }));
    expect(screen.getByText('Rendez-vous confirmé')).toBeInTheDocument();
    expect(whatsappText()).toContain('est confirmé');
  });

  it('confirming shows the ready message with the WhatsApp link', () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: adminBooking({ status: 'pending' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByText('Rendez-vous confirmé')).toBeInTheDocument();
    expect(screen.getByText(/Prévenez Yasmine sur WhatsApp/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Envoyer sur WhatsApp/ }).getAttribute('href')!.startsWith('https://wa.me/213555123456?text=')).toBe(true);
    expect(screen.getByRole('button', { name: 'Plus tard' })).toBeInTheDocument();
  });

  it('a failed confirm keeps the summary and shows why', () => {
    setStatus.mockImplementation((_input, opts) => opts.onError(new Error('slot_taken')));
    renderSheet({ mode: 'edit', booking: adminBooking({ status: 'pending' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Rendez-vous confirmé')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
  });

  it('“Modifier ou déplacer” opens the form', () => {
    renderSheet({ mode: 'edit', booking: adminBooking() });
    openForm();
    expect(screen.getByLabelText('Nom de la cliente')).toHaveValue('Yasmine');
  });

  it('the demo account gets no call button and a WhatsApp chat with the salon', () => {
    role = 'demo';
    renderSheet({ mode: 'edit', booking: adminBooking({ clientPhone: '05•• •• •• 56' }) });
    expect(screen.queryByRole('link', { name: 'Appeler' })).toBeNull();
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/213555001122');
  });

  it('“Retour au résumé” goes back from the form, asking first if something changed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderSheet({ mode: 'edit', booking: adminBooking() });
    openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Retour au résumé' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();

    openForm();
    fireEvent.change(screen.getByLabelText('Nom de la cliente'), { target: { value: 'Yasmine B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retour au résumé' }));
    expect(confirm).toHaveBeenCalledWith('Abandonner les modifications non enregistrées ?');
    expect(screen.getByLabelText('Nom de la cliente')).toHaveValue('Yasmine B'); // declined: stays

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retour au résumé' }));
    openForm();
    expect(screen.getByLabelText('Nom de la cliente')).toHaveValue('Yasmine'); // accepted: edits dropped
  });

  it('the demo without a salon number shows the message but no broken WhatsApp link', () => {
    role = 'demo';
    salonWhatsapp = null;
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: adminBooking({ clientPhone: '05•• •• •• 56' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByText('Rendez-vous confirmé')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Envoyer sur WhatsApp/ })).toBeNull();
  });

  it('lays the client name out in its own direction', () => {
    renderSheet({ mode: 'edit', booking: adminBooking({ clientName: 'Lina M.' }) });
    expect(screen.getByText('Lina M.')).toHaveAttribute('dir', 'auto');
  });

  it('the owner can call or open a WhatsApp chat with the client', () => {
    renderSheet({ mode: 'edit', booking: adminBooking() });
    expect(screen.getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:0555123456');
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/213555123456');
  });
});

describe('BookingSheet — polish', () => {
  it('asks before discarding a half-typed booking on a backdrop tap or Escape', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = renderSheet(addState);
    fillClient('Rania', '');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(confirm).toHaveBeenCalledWith('Abandonner ce rendez-vous non enregistré ?');
    expect(onClose).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without asking when nothing was typed', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onClose = renderSheet(addState);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps an off-grid booking time in order and flags it if the service no longer fits', () => {
    servicesOverride = [{ ...services[0], duration: 120 }, ...services.slice(1)];
    renderSheet({ mode: 'edit', booking: adminBooking({ startIso: '2030-01-08T16:30:00Z' }) }); // 17:30 in Algiers
    openForm();
    const options = within(screen.getByLabelText('Heure')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([...options].sort());
    expect(screen.getByLabelText('Heure')).toHaveValue('17:30');
    expect(screen.getByText('En dehors des horaires du salon ce jour-là.')).toBeInTheDocument();
  });

  it('moves focus into the sheet and keeps Tab inside it', () => {
    renderSheet(addState);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    const focusables = dialog.querySelectorAll<HTMLElement>('button, input, select');
    focusables[focusables.length - 1].focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);
  });

  it('says it is loading instead of silently ignoring Save before services arrive', () => {
    servicesOverride = [];
    renderSheet(addState);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByText('Chargement des prestations…')).toBeInTheDocument();
  });
});

describe('BookingSheet — salon settings', () => {
  it("warns that Amina doesn't work that day, and still saves", () => {
    daysOff = [{ id: 'o1', stylistId: 'amina', from: '2030-01-08', to: '2030-01-08' }];
    renderSheet({ ...addState, stylistId: 'amina' });
    expect(screen.getByText('Amina ne travaille pas ce jour-là')).toBeInTheDocument();
    fillClient('Rania', '0555123456');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ stylistId: 'amina' }), expect.anything());
  });

  it('shows no warning when the stylist works that day, and updates it when the stylist changes', () => {
    daysOff = [{ id: 'o1', stylistId: 'amina', from: '2030-01-08', to: '2030-01-08' }];
    renderSheet(addState);
    expect(screen.queryByText(/ne travaille pas ce jour-là/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Styliste'), { target: { value: 'amina' } });
    expect(screen.getByText('Amina ne travaille pas ce jour-là')).toBeInTheDocument();
  });

  it("keeps a booking's hidden service in the picker, but offers no other hidden one", () => {
    servicesOverride = [
      ...services,
      { ...services[0], id: 'old-cut', name: { fr: 'Ancienne coupe', ar: 'قص قديم' }, active: false },
      { ...services[0], id: 'gone', name: { fr: 'Disparue', ar: 'محذوفة' }, active: false },
    ];
    renderSheet({ mode: 'edit', booking: adminBooking({ serviceId: 'old-cut', serviceName: { fr: 'Ancienne coupe', ar: 'قص قديم' } }) });
    openForm();
    const select = screen.getByLabelText('Prestation');
    expect(select).toHaveValue('old-cut');
    expect(within(select).getByRole('option', { name: 'Ancienne coupe' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Disparue' })).toBeNull();
  });

  it("keeps a booking's hidden stylist in the picker, but offers no other hidden one", () => {
    stylistsOverride = stylists.map((s) => (s.id === 'sara' ? s : { ...s, active: false }));
    renderSheet({ mode: 'edit', booking: adminBooking() }); // Amina, now hidden
    openForm();
    const select = screen.getByLabelText('Styliste');
    expect(select).toHaveValue('amina');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Amina', 'Sara']);
  });

  it('a booking on a closed date keeps its own time to pick', () => {
    renderSheet({ mode: 'edit', booking: adminBooking({ startIso: '2030-01-07T09:00:00Z' }) }); // Monday: closed
    openForm();
    const options = within(screen.getByLabelText('Heure')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['10:00']);
    expect(screen.getByLabelText('Heure')).toHaveValue('10:00');
  });
});

describe('BookingSheet — demo account', () => {
  const masked = '05•• •• •• 56';

  it('saves the masked phone back exactly as received, without a phone error', () => {
    role = 'demo';
    renderSheet({ mode: 'edit', booking: adminBooking({ clientPhone: masked }) });
    openForm();
    expect(screen.getByLabelText('Téléphone')).toHaveValue(masked);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.queryByText(/numéro/i)).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].clientPhone).toBe(masked);
  });

  it('still validates a phone the visitor typed', () => {
    role = 'demo';
    renderSheet({ mode: 'edit', booking: adminBooking({ clientPhone: masked }) });
    openForm();
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(update).not.toHaveBeenCalled();
  });

  it('opens WhatsApp to the salon number, not the client', () => {
    role = 'demo';
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: adminBooking({ clientPhone: masked }) });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer/ }));
    const href = screen.getByRole('link', { name: /Envoyer sur WhatsApp/ }).getAttribute('href')!;
    expect(href.startsWith('https://wa.me/213555001122?text=')).toBe(true);
  });

  it('hides the call shortcut (the number is masked)', () => {
    role = 'demo';
    renderSheet({ mode: 'edit', booking: adminBooking({ clientPhone: masked }) });
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it('keeps the call shortcut for the owner', () => {
    renderSheet({ mode: 'edit', booking: adminBooking() });
    expect(document.querySelector('a[href^="tel:"]')).toHaveAttribute('href', 'tel:0555123456');
  });

  it('keeps the client number for the owner', () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: adminBooking() });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer/ }));
    const href = screen.getByRole('link', { name: /Envoyer sur WhatsApp/ }).getAttribute('href')!;
    expect(href.startsWith('https://wa.me/213555123456?text=')).toBe(true);
  });
});

