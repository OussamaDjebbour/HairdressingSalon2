import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Service, Stylist, StylistDayOff } from '../../data/types';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const svc = (id: string, fr: string, active: boolean): Service => ({
  id, category: 'coiffure', name: { fr, ar: `${fr}-ar` }, description: { fr: 'd', ar: 'د' },
  price: 3000, duration: 45, image: '', icon: '', active, sortOrder: 1,
});
let services: Service[] = [];
let stylists: Stylist[] = [];
let daysOff: StylistDayOff[] = [];
vi.mock('../../data/queries', () => ({
  useAllServices: () => ({ data: services }),
  useAllStylists: () => ({ data: stylists }),
}));
vi.mock('../../data/salonSettings', async (orig) => ({
  ...(await orig<typeof import('../../data/salonSettings')>()),
  useStylistDaysOff: () => ({ data: daysOff }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { StylistsSettings } from './StylistsSettings';

function renderIt() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LanguageProvider>
          <StylistsSettings />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const sty = (id: string, name: string, active: boolean): Stylist => ({
  id, name, role: { fr: 'Coiffeuse', ar: 'مصففة' }, specialties: [], image: '',
  serviceIds: ['s1', 'h1'], active, workdays: [2, 3, 4, 5, 6],
});

const affectedRow = { id: 'b1', starts_at: '2030-01-08T09:00:00Z', client_name: 'Sara', reason: 'stylist_hidden' };

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) => (fn === 'admin_affected_bookings' ? { data: [], error: null } : { data: null, error: null }));
  services = [svc('s1', 'Brushing', true), svc('s2', 'Coloration', true), svc('h1', 'Old cut', false), svc('h2', 'Other old', false)];
  stylists = [sty('x1', 'Hidden one', false), sty('amina', 'Amina', true)];
  daysOff = [
    { id: 'd1', stylistId: 'amina', from: '2020-01-01', to: '2020-01-05' },
    { id: 'd2', stylistId: 'amina', from: '2099-03-02', to: '2099-03-04' },
    { id: 'd3', stylistId: 'x1', from: '2099-04-01', to: '2099-04-01' },
  ];
});

describe('StylistsSettings', () => {
  it('lists active stylists first, hidden ones marked', () => {
    renderIt();
    expect(screen.getAllByTestId('stylist-name').map((n) => n.textContent)).toEqual(['Amina', 'Hidden one']);
    expect(screen.getAllByText('Masquée')).toHaveLength(1);
  });

  it('saves the full arrays, hidden linked services included', async () => {
    renderIt();
    fireEvent.click(screen.getByText('Amina'));
    expect(screen.getByLabelText(/Old cut/)).toBeChecked();
    expect(screen.queryByLabelText(/Other old/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_stylist', {
        p_id: 'amina', p_name: 'Amina', p_role: { fr: 'Coiffeuse', ar: 'مصففة' },
        p_service_ids: ['s1', 'h1'], p_weekdays: [2, 3, 4, 5, 6],
      })
    );
  });

  it('unticking Wednesday sends [2,4,5,6]', async () => {
    renderIt();
    fireEvent.click(screen.getByText('Amina'));
    fireEvent.click(screen.getByRole('button', { name: 'Mercredi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_stylist', expect.objectContaining({ p_weekdays: [2, 4, 5, 6] }))
    );
  });

  it('a new stylist sends empty arrays, never null', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Lina' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_stylist', {
        p_id: null, p_name: 'Lina', p_role: { fr: '', ar: '' }, p_service_ids: [], p_weekdays: [],
      })
    );
  });

  it('shows only upcoming days off for this stylist', () => {
    renderIt();
    fireEvent.click(screen.getByText('Amina'));
    expect(screen.getAllByTestId('day-off')).toHaveLength(1);
    expect(screen.getByTestId('day-off').textContent).toContain('2 mars');
  });

  it('adds a day off with YYYY-MM-DD strings and shows invalid_dates', async () => {
    renderIt();
    fireEvent.click(screen.getByText('Amina'));
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2030-05-10' } });
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2030-05-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un congé' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_add_stylist_days_off', { p_stylist_id: 'amina', p_from: '2030-05-10', p_to: '2030-05-12' })
    );

    rpc.mockImplementation(async (fn: string) =>
      fn === 'admin_add_stylist_days_off' ? { data: null, error: { message: 'invalid_dates' } } : { data: [], error: null }
    );
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2030-06-10' } });
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2030-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un congé' }));
    expect(await screen.findByText(/Les dates sont invalides/)).toBeInTheDocument();
  });

  it('deletes a day off', async () => {
    renderIt();
    fireEvent.click(screen.getByText('Amina'));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer ce congé' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_delete_stylist_days_off', { p_id: 'd2' }));
  });

  it('hiding a stylist lists affected bookings', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'admin_affected_bookings' ? { data: [affectedRow], error: null } : { data: null, error: null }
    );
    renderIt();
    fireEvent.click(screen.getAllByRole('button', { name: 'Masquer' })[0]);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_set_stylist_active', { p_id: 'amina', p_active: false }));
    expect(await screen.findByRole('link', { name: /Sara/ })).toHaveAttribute('href', '/admin?day=2030-01-08&booking=b1');
  });
});
