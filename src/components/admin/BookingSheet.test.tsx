import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    useCategories: () => ({ data: [{ id: 'c1', name: { fr: 'Soins mariée', ar: 'عروس' }, sortOrder: 1 }], isLoading: false, isError: false }),
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
const removePart = vi.fn();
const moveVisit = vi.fn();
let pending = false;
let visitParts: import('../../data/admin').AdminBooking[] | undefined;
let role: 'owner' | 'demo' | null = 'owner';
vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useCreateStaffBooking: () => ({ mutate: create, isPending: pending }),
  useUpdateStaffBooking: () => ({ mutate: update, isPending: pending }),
  useSetBookingStatus: () => ({ mutate: setStatus, isPending: pending }),
  useRemoveVisitPart: () => ({ mutate: removePart, isPending: pending }),
  useMoveVisit: () => ({ mutate: moveVisit, isPending: pending }),
  useMyRole: () => role,
  useVisitParts: () => ({ data: visitParts }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { FeedbackProvider } from './feedback';
import { BookingSheet, type SheetState } from './BookingSheet';
import { visitOf, type AdminVisit } from '../../data/admin';

const tuesday = new Date(2030, 0, 8);
const addState: SheetState = { mode: 'add', stylistId: 'sara', date: tuesday, time: '10:00' };

function renderSheet(state: SheetState, onClose = vi.fn(), visit?: AdminVisit) {
  render(
    <LanguageProvider><FeedbackProvider>
      <BookingSheet state={state} onClose={onClose} visit={visit} />
    </FeedbackProvider></LanguageProvider>
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
/** Answers the confirm dialog titled `title` with the button `choice`, and waits for it to close. */
async function answer(title: string, choice: string) {
  const dialog = await screen.findByRole('alertdialog', { name: title });
  fireEvent.click(within(dialog).getByRole('button', { name: choice }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
}

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
  visitParts = undefined;
  role = 'owner';
  servicesOverride = undefined;
  stylistsOverride = undefined;
  daysOff = [];
  salonWhatsapp = '0555 00 11 22';
});

describe('BookingSheet — categories', () => {
  it('lists services in category group order', () => {
    servicesOverride = [
      { ...services[0], id: 'k1', category: 'custom', customCategoryId: 'c1', name: { fr: 'Forfait', ar: 'ف' } },
      { ...services[0], id: 'k2', category: 'ongles', name: { fr: 'Vernis', ar: 'ط' } },
      { ...services[0], id: 'k3', name: { fr: 'Coupe', ar: 'ق' } },
    ];
    renderSheet(addState);
    expect(optionNames('Prestation')).toEqual(['Coupe', 'Vernis', 'Forfait']);
  });
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
    expect(await screen.findByText('Rendez-vous ajouté')).toBeInTheDocument();
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

  it('cancelling asks first, then offers the cancellation message', async () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: adminBooking({ status: 'confirmed' }) });
    expect(screen.queryByRole('button', { name: /Confirmer/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler le rendez-vous' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Annuler ce rendez-vous ?' });
    expect(dialog).toHaveTextContent('Le créneau sera libéré.');
    expect(setStatus).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Oui, annuler' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
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
    expect(await screen.findByText('Modifications enregistrées')).toBeInTheDocument();
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

  it('“Retour au résumé” goes back from the form, asking first if something changed', async () => {
    renderSheet({ mode: 'edit', booking: adminBooking() });
    openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Retour au résumé' }));
    expect(await screen.findByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    openForm();
    fireEvent.change(screen.getByLabelText('Nom de la cliente'), { target: { value: 'Yasmine B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retour au résumé' }));
    await answer('Abandonner les modifications non enregistrées ?', 'Continuer');
    expect(screen.getByLabelText('Nom de la cliente')).toHaveValue('Yasmine B'); // declined: stays

    fireEvent.click(screen.getByRole('button', { name: 'Retour au résumé' }));
    await answer('Abandonner les modifications non enregistrées ?', 'Abandonner');
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
  it('asks before discarding a half-typed booking on a backdrop tap or Escape', async () => {
    const onClose = renderSheet(addState);
    fillClient('Rania', '');
    fireEvent.keyDown(window, { key: 'Escape' });
    await answer('Abandonner ce rendez-vous non enregistré ?', 'Continuer');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('dialog').parentElement!);
    await answer('Abandonner ce rendez-vous non enregistré ?', 'Abandonner');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('an Escape while the question is open answers it, and leaves the sheet open', async () => {
    const onClose = renderSheet(addState);
    fillClient('Rania', '');
    fireEvent.keyDown(window, { key: 'Escape' });
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nom de la cliente')).toHaveValue('Rania');
  });

  it('closes without asking when nothing was typed', () => {
    const onClose = renderSheet(addState);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
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

describe('BookingSheet — visit', () => {
  const first = adminBooking({ id: 'p1', visitId: 'v1', startIso: '2030-01-08T09:00:00Z' });
  const second = adminBooking({
    id: 'p2', visitId: 'v1', startIso: '2030-01-08T10:00:00Z', price: 6000, serviceId: 'coloration',
    serviceName: { fr: 'Coloration', ar: 'صبغة' }, stylistId: 'sara', stylistName: 'Sara',
  });
  const visit = visitOf(first, [first, second]);

  it('a part of a visit shows the whole visit', () => {
    renderSheet({ mode: 'edit', booking: second }, vi.fn(), visit);
    const list = screen.getByRole('list', { name: 'Toute la visite' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('10:00 Coupe & Brushing · Amina');
    expect(items[1]).toHaveTextContent('11:00 Coloration · Sara');
    expect(items[1]).toHaveAttribute('aria-current', 'true');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('8 500 DA')).toBeInTheDocument();
  });

  it('confirming a visit confirms it once and the message names every service', () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: second }, vi.fn(), visit);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith({ id: 'p1', status: 'confirmed' }, expect.anything());
    const text = whatsappText();
    expect(text).toContain('Coupe & Brushing + Coloration');
    expect(text).toContain('à 10:00');
  });

  it('cancelling a multi-part visit says it cancels every service', async () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    renderSheet({ mode: 'edit', booking: second }, vi.fn(), visit);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Annuler toute la visite ?' });
    expect(dialog).toHaveTextContent('Les 2 prestations seront annulées : Coupe & Brushing + Coloration.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Oui, annuler' }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith({ id: 'p1', status: 'cancelled' }, expect.anything()));
  });

  it('the visit message goes to the number of the part that was opened', () => {
    setStatus.mockImplementation((_input, opts) => opts.onSuccess());
    const fixed = { ...second, clientPhone: '0770998877' };
    renderSheet({ mode: 'edit', booking: fixed }, vi.fn(), visitOf(first, [first, fixed]));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('link', { name: /Envoyer sur WhatsApp/ }).getAttribute('href')!.startsWith('https://wa.me/213770998877?text=')).toBe(true);
  });

  it('a failed visit confirm shows why and keeps the sheet', () => {
    setStatus.mockImplementation((_input, opts) => opts.onError(new Error('slot_taken')));
    renderSheet({ mode: 'edit', booking: second }, vi.fn(), visit);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Rendez-vous confirmé')).toBeNull();
    expect(screen.getByRole('list', { name: 'Toute la visite' })).toBeInTheDocument();
  });

  it('shows a part from outside the loaded pool, from admin_visit_parts', () => {
    const farAway = adminBooking({
      id: 'p3', visitId: 'v1', startIso: '2030-01-08T11:00:00Z', price: 1500, serviceId: 'manucure',
      serviceName: { fr: 'Manucure', ar: 'مانيكير' }, stylistId: 'leila', stylistName: 'Leila',
    });
    visitParts = [first, second, farAway];
    renderSheet({ mode: 'edit', booking: first });
    const items = within(screen.getByRole('list', { name: 'Toute la visite' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[2]).toHaveTextContent('12:00 Manucure · Leila');
    expect(screen.getByText('10 000 DA')).toBeInTheDocument();
  });

  describe('Retirer', () => {
    const cancelledSecond = { ...second, status: 'cancelled' as const };
    beforeEach(() => { removePart.mockReset(); });

    it('shows Retirer on each part of a two-part visit', () => {
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      expect(screen.getByRole('button', { name: 'Retirer Coupe & Brushing' })).toHaveClass('tap');
      expect(screen.getByRole('button', { name: 'Retirer Coloration' })).toHaveClass('tap');
    });

    it('the per-part edit link reads Modifier cette partie on a visit, Modifier ou déplacer on a single booking', () => {
      const { unmount: un } = render(
        <LanguageProvider><FeedbackProvider><BookingSheet state={{ mode: 'edit', booking: first }} onClose={vi.fn()} visit={visit} /></FeedbackProvider></LanguageProvider>
      );
      expect(screen.getByRole('button', { name: 'Modifier cette partie' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Modifier ou déplacer' })).toBeNull();
      un();
      renderSheet({ mode: 'edit', booking: adminBooking() });
      expect(screen.getByRole('button', { name: 'Modifier ou déplacer' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Modifier cette partie' })).toBeNull();
    });

    it('the Retirer question names the client and the service', async () => {
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(screen.getByRole('button', { name: 'Retirer Coloration' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'Retirer cette prestation ?' });
      expect(dialog).toHaveTextContent('La prestation « Coloration » sera retirée de la visite de Yasmine.');
    });

    it('no Retirer on a visit of one', () => {
      renderSheet({ mode: 'edit', booking: adminBooking() });
      expect(screen.queryByRole('button', { name: /^Retirer/ })).toBeNull();
    });

    it('no Retirer when the other part is cancelled', () => {
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visitOf(first, [first, cancelledSecond]));
      expect(screen.queryByRole('button', { name: /^Retirer/ })).toBeNull();
    });

    it('Retirer asks first, then calls admin_remove_visit_part with that part\'s id', async () => {
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(screen.getByRole('button', { name: 'Retirer Coloration' }));
      const dialog = await screen.findByRole('alertdialog', { name: 'Retirer cette prestation ?' });
      expect(dialog).toHaveTextContent('Coloration');
      expect(dialog).toHaveTextContent('Yasmine');
      await answer('Retirer cette prestation ?', 'Garder');
      expect(removePart).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Retirer Coloration' }));
      await answer('Retirer cette prestation ?', 'Retirer');
      expect(removePart).toHaveBeenCalledWith('p2', expect.anything());
    });

    it('after Retirer: toast and the changed message names the remaining service and its start', async () => {
      removePart.mockImplementation((_id, opts) => opts.onSuccess());
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(screen.getByRole('button', { name: 'Retirer Coloration' }));
      await answer('Retirer cette prestation ?', 'Retirer');
      expect(await screen.findByText('Prestation retirée')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Visite modifiée' })).toBeInTheDocument();
      const text = whatsappText();
      expect(text).toContain('Coupe & Brushing');
      expect(text).not.toContain('Coloration');
      expect(text).toContain('10:00');
    });

    it('Retirer error shows inline', async () => {
      removePart.mockImplementation((_id, opts) => opts.onError(new Error('last_part')));
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(screen.getByRole('button', { name: 'Retirer Coloration' }));
      await answer('Retirer cette prestation ?', 'Retirer');
      expect(await screen.findByRole('alert')).toHaveTextContent('dernière prestation');
    });
    it('a later failed Confirmer replaces a stale Retirer error', async () => {
      removePart.mockImplementation((_id, opts) => opts.onError(new Error('last_part')));
      setStatus.mockImplementation((_input, opts) => opts.onError(new Error('slot_taken')));
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(screen.getByRole('button', { name: 'Retirer Coloration' }));
      await answer('Retirer cette prestation ?', 'Retirer');
      expect(await screen.findByRole('alert')).toHaveTextContent('dernière prestation');
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
      expect(screen.getByRole('alert')).not.toHaveTextContent('dernière prestation');
    });

    it('a cancelled part is not listed and the total counts live parts only', () => {
      const third = adminBooking({
        id: 'p3', visitId: 'v1', startIso: '2030-01-08T11:00:00Z', price: 1500, serviceId: 'manucure',
        serviceName: { fr: 'Manucure', ar: 'مانيكير' }, stylistId: 'leila', stylistName: 'Leila', status: 'cancelled',
      });
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visitOf(first, [first, second, third]));
      const items = within(screen.getByRole('list', { name: 'Toute la visite' })).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(screen.queryByText(/Manucure/)).toBeNull();
      expect(screen.getByText('8 500 DA')).toBeInTheDocument();
    });

    it('a fully cancelled visit still lists every part, without Retirer', () => {
      const c1 = { ...first, status: 'cancelled' as const };
      renderSheet({ mode: 'edit', booking: c1 }, vi.fn(), visitOf(c1, [c1, cancelledSecond]));
      expect(within(screen.getByRole('list', { name: 'Toute la visite' })).getAllByRole('listitem')).toHaveLength(2);
      expect(screen.queryByRole('button', { name: /^Retirer/ })).toBeNull();
    });
  });

  describe('Déplacer', () => {
    const move = () => screen.queryByRole('button', { name: 'Déplacer la visite' });

    it('shows only for a movable visit', () => {
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      expect(move()).toBeInTheDocument();
    });

    it('is hidden for a visit of one, a cancelled visit, and a visit over two days', () => {
      const cases = [
        { b: adminBooking(), v: undefined },
        { b: first, v: visitOf(first, [first, { ...second, status: 'cancelled' as const }]) },
        { b: first, v: visitOf(first, [first, { ...second, startsAt: new Date('2030-01-09T10:00:00Z'), endsAt: new Date('2030-01-09T11:00:00Z') }]) },
      ];
      for (const c of cases) {
        const { unmount: un } = render(
          <LanguageProvider><FeedbackProvider><BookingSheet state={{ mode: 'edit', booking: c.b }} onClose={vi.fn()} visit={c.v} /></FeedbackProvider></LanguageProvider>
        );
        expect(move()).toBeNull();
        un();
      }
    });

    it('the move view is titled Déplacer la visite', () => {
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(move()!);
      expect(screen.getByRole('dialog', { name: 'Déplacer la visite' })).toBeInTheDocument();
    });

    it('closing from the move view with changes asks to discard', async () => {
      const onClose = renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(move()!);
      pickOption('Heure', '14:00');
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      await answer('Abandonner les modifications non enregistrées ?', 'Continuer');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closing from an unchanged move view does not ask', async () => {
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(move()!);
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('a stale Retirer error is cleared when entering and leaving the move view', async () => {
      removePart.mockImplementation((_id, opts) => opts.onError(new Error('last_part')));
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(screen.getByRole('button', { name: 'Retirer Coloration' }));
      await answer('Retirer cette prestation ?', 'Retirer');
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      fireEvent.click(move()!);
      expect(screen.queryByRole('alert')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Retour au résumé' }));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('the moved message uses the opened booking client', async () => {
      moveVisit.mockImplementation((_i, opts) => opts.onSuccess());
      const named = { ...first, clientName: 'Nadia', clientPhone: '0770998877' };
      renderSheet({ mode: 'edit', booking: named }, vi.fn(), visitOf(named, [named, second]));
      fireEvent.click(move()!);
      pickOption('Heure', '14:00');
      fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
      await screen.findByText('Visite déplacée');
      expect(whatsappText()).toContain('Nadia');
      expect(screen.getByRole('link', { name: /Envoyer sur WhatsApp/ }).getAttribute('href')).toContain('213770998877');
    });

    it('a visit cancelled elsewhere: a refused move falls back to the summary with the error', () => {
      const cancelled = [first, second].map((p) => ({ ...p, status: 'cancelled' as const }));
      moveVisit.mockImplementation((_i, opts) => {
        // The refusal invalidates ['admin']: the visit's parts come back all cancelled.
        visitParts = cancelled;
        opts.onError(new Error('not_movable'));
      });
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(move()!);
      pickOption('Heure', '14:00');
      fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
      expect(screen.queryByRole('button', { name: 'Déplacer' })).toBeNull();
      // The summary again (the opened part is the caller's snapshot; the other one is now cancelled).
      expect(screen.queryByRole('dialog', { name: 'Déplacer la visite' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Cette visite ne peut pas être déplacée.');
      expect(move()).toBeNull();
    });

    it('the move view gives way to the summary when the visit stops being movable on a refetch', () => {
      const { rerender } = render(
        <LanguageProvider><FeedbackProvider><BookingSheet state={{ mode: 'edit', booking: first }} onClose={vi.fn()} visit={visit} /></FeedbackProvider></LanguageProvider>
      );
      fireEvent.click(move()!);
      expect(screen.getByRole('dialog', { name: 'Déplacer la visite' })).toBeInTheDocument();
      visitParts = [first, second].map((p) => ({ ...p, status: 'cancelled' as const }));
      rerender(
        <LanguageProvider><FeedbackProvider><BookingSheet state={{ mode: 'edit', booking: first }} onClose={vi.fn()} visit={visit} /></FeedbackProvider></LanguageProvider>
      );
      expect(screen.queryByRole('button', { name: 'Déplacer' })).toBeNull();
      // The summary again (the opened part is the caller's snapshot; the other one is now cancelled).
      expect(screen.queryByRole('dialog', { name: 'Déplacer la visite' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
    });

    it('after a move: toast and the moved message with all services and the new start', async () => {
      moveVisit.mockImplementation((_i, opts) => opts.onSuccess());
      renderSheet({ mode: 'edit', booking: first }, vi.fn(), visit);
      fireEvent.click(move()!);
      pickOption('Heure', '14:00');
      fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
      expect(await screen.findByText('Visite déplacée')).toBeInTheDocument();
      const text = whatsappText();
      expect(text).toContain('Coupe & Brushing + Coloration');
      expect(text).toContain('14:00');
    });
  });

  it('a visit of one looks as before', () => {
    renderSheet({ mode: 'edit', booking: adminBooking() });
    expect(screen.queryByRole('list', { name: 'Toute la visite' })).toBeNull();
  });
});
