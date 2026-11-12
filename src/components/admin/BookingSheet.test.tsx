import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import type { StylistDayOff } from '../../data/types';
import { services, stylists, adminBooking } from './fixtures';
import { openSelect, optionNames, pickOption } from '../../test/select';

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

/** Save, then let the form's (async) validation settle. */
async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  });
}

const combo = (name: string) => screen.getByRole('combobox', { name });

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
    expect(combo('Coiffeuse')).toHaveTextContent('Sara');
    expect(screen.getByLabelText('Date')).toHaveTextContent('Mardi 8 janvier');
    expect(combo('Heure')).toHaveTextContent('10:00');
    const serviceOptions = optionNames('Prestation');
    for (const s of services) {
      expect(serviceOptions).toContain(s.name.fr);
    }
    expect(stylists).toHaveLength(3);
  });

  it('can open pre-filled with a service, coiffeuse and time (from the calendar)', () => {
    renderSheet({ mode: 'add', stylistId: 'leila', date: tuesday, time: '11:00', serviceId: 'manucure' });
    expect(combo('Prestation')).toHaveTextContent('Manucure');
    expect(combo('Coiffeuse')).toHaveTextContent('Leila');
    expect(combo('Heure')).toHaveTextContent('11:00');
  });

  it('add sends a staff booking', async () => {
    renderSheet(addState);
    fillClient('Rania', '0555 12 34 56');
    await save();
    expect(create).toHaveBeenCalledWith(
      {
        serviceId: 'coupe-femme', stylistId: 'sara', date: tuesday, time: '10:00',
        clientName: 'Rania', clientPhone: '0555 12 34 56', lang: 'fr',
      },
      expect.anything()
    );
  });

  it('invalid phone blocks save', async () => {
    renderSheet(addState);
    fillClient('Rania', '021 12 34 56');
    await save();
    expect(screen.getByText(/Numéro de mobile algérien invalide/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows slot_taken message and keeps the sheet open', async () => {
    create.mockImplementation((_input, opts) => opts.onError({ message: 'slot_taken' }));
    const onClose = renderSheet(addState);
    fillClient('Rania', '0555123456');
    await save();
    expect(screen.getByText('Cette styliste a déjà un rendez-vous à cette heure.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom de la cliente')).toHaveValue('Rania');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes after a successful add', async () => {
    create.mockImplementation((_input, opts) => opts.onSuccess('new-id'));
    const onClose = renderSheet(addState);
    fillClient('Rania', '0555123456');
    await save();
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

  it('moving offers the moved message', async () => {
    update.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: adminBooking() });
    openForm();
    pickOption('Heure', '11:00');
    await save();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', time: '11:00' }), expect.anything());
    expect(whatsappText()).toContain('a été déplacé au Mardi 8 janvier à 11:00');
  });

  it('a name-only edit just closes', async () => {
    update.mockImplementation((_input, opts) => opts.onSuccess());
    const onClose = renderSheet({ mode: 'edit', booking: adminBooking() });
    openForm();
    fireEvent.change(screen.getByLabelText('Nom de la cliente'), { target: { value: 'Yasmine B' } });
    await save();
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

  it('says “Coiffeuse”, like the rest of the admin', () => {
    renderSheet({ mode: 'edit', booking: adminBooking() });
    expect(screen.getByText('Coiffeuse')).toBeInTheDocument();
    expect(screen.queryByText('Styliste')).toBeNull();
  });

  it('shows cancelling and refusing as destructive, apart from the main action', () => {
    renderSheet({ mode: 'edit', booking: adminBooking({ status: 'confirmed' }) });
    expect(screen.getByRole('button', { name: 'Annuler le rendez-vous' })).toHaveClass('text-rust-700', 'w-full');
  });

  it('refusing a request is shown as destructive too', () => {
    renderSheet({ mode: 'edit', booking: adminBooking({ status: 'pending' }) });
    expect(screen.getByRole('button', { name: 'Refuser' })).toHaveClass('text-rust-700');
  });

  it('gives every control in the sheet a full-size tap area', () => {
    renderSheet({ mode: 'edit', booking: adminBooking() });
    for (const name of ['Fermer', 'Modifier ou déplacer']) expect(screen.getByRole('button', { name })).toHaveClass('tap');
    for (const name of ['Appeler', 'WhatsApp']) expect(screen.getByRole('link', { name })).toHaveClass('tap');
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
    expect(combo('Heure')).toHaveTextContent('17:30');
    const options = optionNames('Heure');
    expect(options).toContain('17:30');
    expect(options).toEqual([...options].sort());
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
  it("warns that Amina doesn't work that day, and still saves", async () => {
    daysOff = [{ id: 'o1', stylistId: 'amina', from: '2030-01-08', to: '2030-01-08' }];
    renderSheet({ ...addState, stylistId: 'amina' });
    expect(screen.getByText('Amina ne travaille pas ce jour-là')).toBeInTheDocument();
    fillClient('Rania', '0555123456');
    await save();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ stylistId: 'amina' }), expect.anything());
  });

  it('shows no warning when the stylist works that day, and updates it when the stylist changes', () => {
    daysOff = [{ id: 'o1', stylistId: 'amina', from: '2030-01-08', to: '2030-01-08' }];
    renderSheet(addState);
    expect(screen.queryByText(/ne travaille pas ce jour-là/)).toBeNull();
    pickOption('Coiffeuse', 'Amina');
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
    expect(combo('Prestation')).toHaveTextContent('Ancienne coupe');
    const options = optionNames('Prestation');
    expect(options).toContain('Ancienne coupe');
    expect(options).not.toContain('Disparue');
  });

  it("keeps a booking's hidden stylist in the picker, but offers no other hidden one", () => {
    stylistsOverride = stylists.map((s) => (s.id === 'sara' ? s : { ...s, active: false }));
    renderSheet({ mode: 'edit', booking: adminBooking() }); // Amina, now hidden
    openForm();
    expect(combo('Coiffeuse')).toHaveTextContent('Amina');
    expect(optionNames('Coiffeuse')).toEqual(['Amina', 'Sara']);
  });

  it('a booking on a closed date keeps its own time to pick', () => {
    renderSheet({ mode: 'edit', booking: adminBooking({ startIso: '2030-01-07T09:00:00Z' }) }); // Monday: closed
    openForm();
    expect(optionNames('Heure')).toEqual(['10:00']);
    expect(combo('Heure')).toHaveTextContent('10:00');
  });
});

describe('BookingSheet — demo account', () => {
  const masked = '05•• •• •• 56';

  it('saves the masked phone back exactly as received, without a phone error', async () => {
    role = 'demo';
    renderSheet({ mode: 'edit', booking: adminBooking({ clientPhone: masked }) });
    openForm();
    expect(screen.getByLabelText('Téléphone')).toHaveValue(masked);
    await save();
    expect(screen.queryByText(/numéro/i)).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].clientPhone).toBe(masked);
  });

  it('still validates a phone the visitor typed', async () => {
    role = 'demo';
    renderSheet({ mode: 'edit', booking: adminBooking({ clientPhone: masked }) });
    openForm();
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '123' } });
    await save();
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


describe('BookingSheet — validation and Radix fields', () => {
  it('an empty Save shows every error and a summary, and focuses the name', async () => {
    renderSheet(addState);
    await save();
    expect(screen.getByText('2 champs à corriger.')).toBeInTheDocument();
    expect(screen.getByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Le numéro est obligatoire.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom de la cliente')).toHaveFocus();
    expect(create).not.toHaveBeenCalled();
  });

  it('a slot taken shows under Heure, which is flagged invalid', async () => {
    create.mockImplementation((_input, opts) => opts.onError({ message: 'slot_taken' }));
    renderSheet(addState);
    fillClient('Rania', '0555123456');
    await save();
    const time = combo('Heure');
    expect(time).toHaveAttribute('aria-invalid', 'true');
    const describedBy = time.getAttribute('aria-describedby')!.split(' ');
    expect(describedBy.map((id) => document.getElementById(id)?.textContent).join(' ')).toContain(
      'Cette styliste a déjà un rendez-vous à cette heure.'
    );
  });

  it('an Escape already handled (by a menu that has since closed) leaves the sheet open', () => {
    const onClose = renderSheet(addState);
    expect(document.querySelector('[data-radix-popper-content-wrapper]')).toBeNull();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    escape.preventDefault();
    act(() => {
      window.dispatchEvent(escape);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a booking at 10:10 shows 10:10 on the Heure field', () => {
    renderSheet({ mode: 'edit', booking: adminBooking({ startIso: '2030-01-08T09:10:00Z' }) }); // 10:10 in Algiers
    openForm();
    expect(combo('Heure')).toHaveTextContent('10:10');
  });

  it('Escape closes the open Heure menu, not the sheet', () => {
    const onClose = renderSheet(addState);
    openSelect('Heure');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Nouveau rendez-vous' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a date picked in the calendar is the one saved', async () => {
    renderSheet(addState);
    fireEvent.click(screen.getByLabelText('Date'));
    fireEvent.click(screen.getByRole('button', { name: /jeudi 10 janvier 2030/ }));
    expect(screen.getByLabelText('Date')).toHaveTextContent('Jeudi 10 janvier');
    fillClient('Rania', '0555123456');
    await save();
    expect(create.mock.calls[0][0].date).toEqual(new Date(2030, 0, 10));
  });
});

describe('BookingSheet — motion', () => {
  const realMatchMedia = window.matchMedia;
  const motion = (reduce: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('reduce') ? reduce : false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  };
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    vi.useRealTimers();
  });

  it('slides down before it closes', () => {
    vi.useFakeTimers();
    motion(false);
    const onClose = renderSheet(addState);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'closing');
    act(() => vi.advanceTimersByTime(250));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes at once when the phone asks for reduced motion', () => {
    motion(true);
    const onClose = renderSheet(addState);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('slides away after a save too, not only on ✕', async () => {
    vi.useFakeTimers();
    motion(false);
    create.mockImplementation((_input, opts) => opts.onSuccess('new-id'));
    const onClose = renderSheet(addState);
    fillClient('Rania', '0555123456');
    await save();
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
