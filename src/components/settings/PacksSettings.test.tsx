import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Service, Stylist } from '../../data/types';
import { pickOption, optionNames } from '../../test/select';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) } },
}));
vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useMyRole: () => 'owner',
}));

const svc = (id: string, fr: string, over: Partial<Service> = {}): Service => ({
  id, category: 'coiffure', name: { fr, ar: `${fr}-ar` }, description: { fr: 'd', ar: 'د' },
  price: 3000, duration: 45, image: '', icon: '', active: true, sortOrder: 1, includes: [], packStylistId: null, promo: null, ...over,
});
const sty = (id: string, name: string, active = true): Stylist => ({
  id, name, role: { fr: 'r', ar: 'r' }, specialties: [], image: '', serviceIds: [], active, workdays: [1],
});
let services: Service[] = [];
let stylists: Stylist[] = [];
vi.mock('../../data/queries', () => ({
  useAllServices: () => ({ data: services, isLoading: false, isError: false }),
  useAllStylists: () => ({ data: stylists, isLoading: false, isError: false }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { FeedbackProvider } from '../admin/feedback';
import { PacksSettings } from './PacksSettings';

function renderIt() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LanguageProvider><FeedbackProvider><PacksSettings /></FeedbackProvider></LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) => (fn === 'admin_save_service' ? { data: 'p-new', error: null } : { data: [], error: null }));
  services = [svc('s1', 'Brushing'), svc('s2', 'Soin', { active: false })];
  stylists = [sty('st1', 'Amina'), sty('st2', 'Lina'), sty('st3', 'Nour', false)];
});

describe('PacksSettings', () => {
  it('creates a pack with its person, includes and price', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau pack' }));
    fireEvent.change(screen.getByLabelText('Nom (français)'), { target: { value: 'Pack mariée' } });
    fireEvent.change(screen.getByLabelText('Prix (DA)'), { target: { value: '9000' } });
    pickOption('Personne responsable', 'Amina');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Brushing' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Soin (Masquée)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_service', expect.objectContaining({
        p_id: null, p_category: 'pack', p_price: 9000, p_includes: ['s1', 's2'], p_pack_stylist_id: 'st1',
        p_promo_price: null, p_promo_from: null, p_promo_to: null,
      }))
    );
  });

  it('the pack form requires a person responsible', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau pack' }));
    fireEvent.change(screen.getByLabelText('Nom (français)'), { target: { value: 'Pack mariée' } });
    fireEvent.change(screen.getByLabelText('Prix (DA)'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Choisissez une personne responsable/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('admin_save_service', expect.anything());
  });

  it('a promo above the price is refused inline', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau pack' }));
    fireEvent.change(screen.getByLabelText('Nom (français)'), { target: { value: 'Pack mariée' } });
    fireEvent.change(screen.getByLabelText('Prix (DA)'), { target: { value: '9000' } });
    pickOption('Personne responsable', 'Amina');
    fireEvent.change(screen.getByLabelText(/Prix promotionnel/), { target: { value: '9500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect((await screen.findAllByText(/Le prix promotionnel doit être inférieur/)).length).toBeGreaterThan(0);
    expect(rpc).not.toHaveBeenCalledWith('admin_save_service', expect.anything());
  });

  it('offers active stylists, and warns when her current person is hidden', () => {
    services = [svc('s1', 'Brushing'), svc('p1', 'Pack', { category: 'pack', packStylistId: 'st3', includes: ['s1'] })];
    renderIt();
    fireEvent.click(screen.getByText('Pack'));
    expect(screen.getByText(/ce pack ne peut pas être réservé en ligne/)).toBeInTheDocument();
    expect(optionNames('Personne responsable')).toEqual(['Amina', 'Lina', 'Nour (Masquée)']);
    expect(screen.getByRole('checkbox', { name: 'Brushing' })).toBeChecked();
  });

  it('lists only packs and keeps the promotion when saving an edit', async () => {
    services = [
      svc('p1', 'Pack', { category: 'pack', packStylistId: 'st1', promo: { price: 100, from: '2000-01-01', to: '2999-12-31' } }),
      svc('s1', 'Brushing'),
    ];
    renderIt();
    expect(screen.getAllByTestId('service-name').map((n) => n.textContent)).toEqual(['Pack']);
    fireEvent.click(screen.getByText('Pack'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_service', expect.objectContaining({
        p_id: 'p1', p_promo_price: 100, p_promo_from: '2000-01-01', p_promo_to: '2999-12-31',
      }))
    );
  });
});
