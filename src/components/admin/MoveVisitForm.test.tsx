import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { SalonHours, StylistDayOff } from '../../data/types';
import { stylists, adminBooking, eleganceHours } from './fixtures';
import { openSelect, optionNames, pickOption } from '../../test/select';

vi.mock('../../data/queries', () => ({
  useAllStylists: () => ({ data: stylists }),
}));

let hours: SalonHours = eleganceHours;
let daysOff: StylistDayOff[] = [];
vi.mock('../../data/salonSettings', () => ({
  useSalonHours: () => ({ data: hours }),
  useClosedDates: () => ({ data: [] }),
  useStylistDaysOff: () => ({ data: daysOff }),
}));

const mutate = vi.fn();
vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useMoveVisit: () => ({ mutate, isPending: false }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { visitOf } from '../../data/admin';
import { MoveVisitForm } from './MoveVisitForm';

// 10:00 Coupe (Amina, 1 h), then 11:00 Coloration (Sara, 1 h) on Tuesday 2030-01-08.
const first = adminBooking({ id: 'p1', visitId: 'v1', startIso: '2030-01-08T09:00:00Z' });
const second = adminBooking({
  id: 'p2', visitId: 'v1', startIso: '2030-01-08T10:00:00Z', serviceId: 'coloration',
  serviceName: { fr: 'Coloration', ar: 'صبغة' }, stylistId: 'sara', stylistName: 'Sara',
});
const visit = visitOf(first, [first, second]);

function renderForm(v = visit, onMoved = vi.fn()) {
  render(<LanguageProvider><MoveVisitForm visit={v} onMoved={onMoved} onBack={vi.fn()} /></LanguageProvider>);
  return onMoved;
}
const rows = () => screen.getAllByRole('listitem').map((li) => li.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  hours = eleganceHours;
  daysOff = [];
});

describe('MoveVisitForm', () => {
  it("prefills the visit's date, first start time and each part's stylist", () => {
    renderForm();
    expect(screen.getByRole('combobox', { name: 'Heure' })).toHaveTextContent('10:00');
    expect(screen.getByRole('combobox', { name: 'Coiffeuse · Coupe & Brushing' })).toHaveTextContent('Amina');
    expect(screen.getByRole('combobox', { name: 'Coiffeuse · Coloration' })).toHaveTextContent('Sara');
  });

  it("shows each part's new time as the start changes", () => {
    renderForm();
    expect(rows()[0]).toContain('10:00Coiffeuse · Coupe');
    pickOption('Heure', '14:00');
    expect(rows()[0]).toMatch(/^14:00Coiffeuse · Coupe & Brushing/);
    expect(rows()[1]).toMatch(/^15:00Coiffeuse · Coloration/);
  });

  it('keeps a gap between parts', () => {
    const late = { ...second, startsAt: new Date('2030-01-08T10:30:00Z'), endsAt: new Date('2030-01-08T11:30:00Z') };
    renderForm(visitOf(first, [first, late]));
    pickOption('Heure', '14:00');
    expect(rows()[1]).toMatch(/^15:30Coiffeuse · Coloration/);
  });

  it('time options fit the whole visit', () => {
    renderForm();
    const names = optionNames('Heure');
    // Span 2 h, closing 18:00: the last start is 16:00.
    expect(names[names.length - 1]).toBe('16:00');
    expect(names).not.toContain('16:15');
  });

  it('warns when the visit would end after closing, submit disabled', () => {
    hours = { ...eleganceHours, 2: { opens: 540, closes: 690 } };
    renderForm();
    expect(screen.getByText('En dehors des horaires du salon ce jour-là.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déplacer' })).toBeDisabled();
  });

  it('warns when a chosen stylist is off that day, submit still enabled', () => {
    daysOff = [{ id: 'o1', stylistId: 'sara', from: '2030-01-08', to: '2030-01-08' }];
    renderForm();
    expect(screen.getByText('Sara ne travaille pas ce jour-là')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déplacer' })).toBeEnabled();
  });

  it('submits id, date, time and only changed stylists', () => {
    renderForm();
    pickOption('Heure', '14:00');
    pickOption('Coiffeuse · Coloration', 'Leila');
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    expect(mutate).toHaveBeenCalledWith(
      { id: 'p1', date: new Date(2030, 0, 8), time: '14:00', stylists: { p2: 'leila' } },
      expect.anything()
    );
  });

  it('slot_taken with item:1 names that part', () => {
    mutate.mockImplementation((_i, opts) => opts.onError(Object.assign(new Error('slot_taken'), { details: 'item:1' })));
    renderForm();
    pickOption('Heure', '14:00');
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Coloration : Sara est déjà prise à 15:00.');
  });

  it('slot_taken without an item shows the generic message', () => {
    mutate.mockImplementation((_i, opts) => opts.onError(new Error('slot_taken')));
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/^Cette styliste a déjà/);
  });

  it('keeps an off-grid own start selectable on its own day', () => {
    const odd = { ...first, startsAt: new Date('2030-01-08T09:10:00Z'), endsAt: new Date('2030-01-08T10:10:00Z') };
    const later = { ...second, startsAt: new Date('2030-01-08T10:10:00Z'), endsAt: new Date('2030-01-08T11:10:00Z') };
    renderForm(visitOf(odd, [odd, later]));
    expect(screen.getByRole('combobox', { name: 'Heure' })).toHaveTextContent('10:10');
    expect(optionNames('Heure')).toContain('10:10');
    expect(screen.getByRole('button', { name: 'Déplacer' })).toBeEnabled();
  });

  it('a kept time before opening warns and disables submit', () => {
    hours = { ...eleganceHours, 2: { opens: 660, closes: 1080 } };
    renderForm();
    expect(screen.getByText('En dehors des horaires du salon ce jour-là.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déplacer' })).toBeDisabled();
  });

  it('a closed day has no time options, warns and disables submit', () => {
    hours = { ...eleganceHours, 2: null };
    renderForm();
    expect(screen.getByText('En dehors des horaires du salon ce jour-là.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Déplacer' })).toBeDisabled();
  });
});
