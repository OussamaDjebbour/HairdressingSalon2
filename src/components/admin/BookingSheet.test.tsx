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
vi.mock('../../data/salonSettings', async () => {
  const f = await import('./fixtures');
  return {
    useSalonHours: () => ({ data: f.eleganceHours }),
    useClosedDates: () => ({ data: [] }),
    useStylistDaysOff: () => ({ data: daysOff }),
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
  servicesOverride = undefined;
  stylistsOverride = undefined;
  daysOff = [];
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
    const options = within(screen.getByLabelText('Heure')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([...options].sort());
    expect(screen.getByLabelText('Heure')).toHaveValue('17:30');
    expect(screen.getByText('En dehors des horaires (9h–18h, fermé dimanche et lundi).')).toBeInTheDocument();
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
    const select = screen.getByLabelText('Prestation');
    expect(select).toHaveValue('old-cut');
    expect(within(select).getByRole('option', { name: 'Ancienne coupe' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Disparue' })).toBeNull();
  });

  it("keeps a booking's hidden stylist in the picker, but offers no other hidden one", () => {
    stylistsOverride = stylists.map((s) => (s.id === 'sara' ? s : { ...s, active: false }));
    renderSheet({ mode: 'edit', booking: adminBooking() }); // Amina, now hidden
    const select = screen.getByLabelText('Styliste');
    expect(select).toHaveValue('amina');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Amina', 'Sara']);
  });

  it('a booking on a closed date keeps its own time to pick', () => {
    renderSheet({ mode: 'edit', booking: adminBooking({ startIso: '2030-01-07T09:00:00Z' }) }); // Monday: closed
    const options = within(screen.getByLabelText('Heure')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['10:00']);
    expect(screen.getByLabelText('Heure')).toHaveValue('10:00');
  });
});
