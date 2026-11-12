import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Service } from '../../data/types';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const svc = (id: string, fr: string, active: boolean, sortOrder: number): Service => ({
  id, category: 'coiffure', name: { fr, ar: `${fr}-ar` }, description: { fr: 'd', ar: 'د' },
  price: 3000, duration: 45, image: '', icon: '', active, sortOrder,
});
let services: Service[] = [];
let servicesQuery: { data?: Service[]; isLoading: boolean; isError: boolean; refetch?: () => void } | null = null;
vi.mock('../../data/queries', () => ({
  useAllServices: () => servicesQuery ?? { data: services, isLoading: false, isError: false },
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { ServicesSettings } from './ServicesSettings';

function renderIt() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LanguageProvider>
          <ServicesSettings />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const affectedRow = { id: 'b1', starts_at: '2030-01-08T09:00:00Z', client_name: 'Sara', reason: 'service_hidden' };

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) => (fn === 'admin_affected_bookings' ? { data: [], error: null } : { data: null, error: null }));
  services = [svc('h1', 'Hidden cut', false, 1), svc('a1', 'Brushing', true, 2), svc('a2', 'Coloration', true, 3)];
  servicesQuery = null;
});

describe('ServicesSettings while the list is not in', () => {
  it('shows a loading state, not an empty list', () => {
    servicesQuery = { data: undefined, isLoading: true, isError: false };
    renderIt();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
    expect(screen.queryByTestId('service-name')).toBeNull();
  });

  it('shows a retry when loading failed', () => {
    const refetch = vi.fn();
    servicesQuery = { data: undefined, isLoading: false, isError: true, refetch };
    renderIt();
    expect(screen.getByText('Impossible de charger le contenu.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('ServicesSettings', () => {
  it('shows with a chevron that a service opens for editing', () => {
    renderIt();
    const row = screen.getAllByTestId('service-name')[0].closest('li')!;
    expect(row.querySelector('.lucide-chevron-right')).not.toBeNull();
  });

  it('lists active services first, then hidden ones marked Masquée', () => {
    renderIt();
    const names = screen.getAllByTestId('service-name').map((n) => n.textContent);
    expect(names).toEqual(['Brushing', 'Coloration', 'Hidden cut']);
    expect(screen.getAllByText('Masquée')).toHaveLength(1);
  });

  it('saves with typed values: integer price, duration from the select', async () => {
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    fireEvent.change(screen.getByLabelText('Prix (DA)'), { target: { value: '3500' } });
    fireEvent.change(screen.getByLabelText('Durée'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Ordre d’affichage'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_service', {
        p_id: 'a1',
        p_name: { fr: 'Brushing', ar: 'Brushing-ar' },
        p_description: { fr: 'd', ar: 'د' },
        p_category: 'coiffure',
        p_price: 3500,
        p_duration: 60,
        p_sort_order: 7,
      })
    );
  });

  it('shows the price error when the server answers invalid_price', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'admin_save_service' ? { data: null, error: { message: 'invalid_price' } } : { data: [], error: null }
    );
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Le prix doit être/)).toBeInTheDocument();
  });

  it('hides a service, then lists affected bookings with a deep link', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'admin_affected_bookings' ? { data: [affectedRow], error: null } : { data: null, error: null }
    );
    renderIt();
    fireEvent.click(screen.getAllByRole('button', { name: 'Masquer' })[0]);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_set_service_active', { p_id: 'a1', p_active: false }));
    const link = await screen.findByRole('link', { name: /Sara/ });
    expect(link).toHaveAttribute('href', '/admin?day=2030-01-08&booking=b1');
  });

  it('shows no card when nothing is affected', async () => {
    renderIt();
    fireEvent.click(screen.getAllByRole('button', { name: 'Masquer' })[0]);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_set_service_active', { p_id: 'a1', p_active: false }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_affected_bookings'));
    expect(screen.queryByText(/Ces rendez-vous ne respectent plus/)).not.toBeInTheDocument();
  });
});
