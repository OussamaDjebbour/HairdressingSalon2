import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

let services: Array<{ id: string; customCategoryId: string | null }> = [];
vi.mock('../../data/queries', () => ({
  useCategories: () => ({
    data: [
      { id: 'a', name: { fr: 'Mariage', ar: 'زفاف' }, sortOrder: 1 },
      { id: 'b', name: { fr: 'Ongles', ar: 'أظافر' }, sortOrder: 2 },
    ],
    isLoading: false, isError: false,
  }),
  useAllServices: () => ({ data: services, isLoading: false, isError: false }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { FeedbackProvider } from '../admin/feedback';
import { CategoriesSettings } from './CategoriesSettings';

function renderIt() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LanguageProvider><FeedbackProvider><CategoriesSettings /></FeedbackProvider></LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  services = [{ id: 's1', customCategoryId: 'a' }, { id: 's2', customCategoryId: 'a' }, { id: 's3', customCategoryId: null }];
});

describe('CategoriesSettings', () => {
  it('lists categories with their service counts', () => {
    renderIt();
    expect(screen.getByText('Mariage')).toBeInTheDocument();
    expect(screen.getByText('2 prestations')).toBeInTheDocument();
    expect(screen.getByText('0 prestation')).toBeInTheDocument();
  });

  it('adds a category with trimmed names and toasts', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('Nom (français)'), { target: { value: '  Soins  ' } });
    fireEvent.change(screen.getByLabelText('Nom (arabe)'), { target: { value: ' عناية ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la catégorie' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_category', { p_id: null, p_name: { fr: 'Soins', ar: 'عناية' } })
    );
    expect(await screen.findByText('Catégorie enregistrée')).toBeInTheDocument();
  });

  it('moves the first one down: sends the full new order', async () => {
    renderIt();
    expect(screen.getAllByRole('button', { name: 'Monter' })[0]).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Descendre' })[0]);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_reorder_categories', { p_ids: ['b', 'a'] }));
  });

  it('asks before deleting, then calls the RPC', async () => {
    renderIt();
    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[1]);
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la catégorie' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_delete_category', { p_id: 'b' }));
    expect(await screen.findByText('Catégorie supprimée')).toBeInTheDocument();
  });

  it('category_in_use shows the count inline', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'category_in_use', details: '3' } });
    renderIt();
    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la catégorie' }));
    expect(await screen.findByText(/Déplacez d'abord ses 3 prestations/)).toBeInTheDocument();
  });

  it('category_in_use with one service is singular', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'category_in_use', details: '1' } });
    renderIt();
    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la catégorie' }));
    expect(await screen.findByText(/Déplacez d'abord sa prestation/)).toBeInTheDocument();
  });

  it('rename prefills both names', () => {
    renderIt();
    fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);
    expect(screen.getByLabelText('Nom (français)')).toHaveValue('Mariage');
    expect(screen.getByLabelText('Nom (arabe)')).toHaveValue('زفاف');
    fireEvent.change(screen.getByLabelText('Nom (français)'), { target: { value: 'Noces' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    return waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_category', { p_id: 'a', p_name: { fr: 'Noces', ar: 'زفاف' } })
    );
  });
});
