import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

vi.mock('../../data/salonSettings', async (orig) => ({
  ...(await orig<typeof import('../../data/salonSettings')>()),
  useClosedDates: () => ({ data: [{ id: 'c1', from: '2099-03-02', to: '2099-03-04', label: 'Aïd' }] }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { ClosedDatesSettings } from './ClosedDatesSettings';

function renderIt() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LanguageProvider>
          <ClosedDatesSettings />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) => (fn === 'admin_affected_bookings' ? { data: [], error: null } : { data: null, error: null }));
});

describe('ClosedDatesSettings', () => {
  it('lists the range with its label', () => {
    renderIt();
    expect(screen.getByTestId('closed-range').textContent).toContain('Aïd');
    expect(screen.getByTestId('closed-range').textContent).toContain('2 mars');
  });

  it('adds a range with label', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2030-03-16' } });
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2030-03-17' } });
    fireEvent.change(screen.getByLabelText('Libellé (facultatif)'), { target: { value: 'Aïd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une fermeture' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_add_closed_dates', { p_from: '2030-03-16', p_to: '2030-03-17', p_label: 'Aïd' })
    );
  });

  it('caps the label at 60 characters', () => {
    renderIt();
    expect(screen.getByLabelText('Libellé (facultatif)')).toHaveAttribute('maxLength', '60');
  });

  it('to defaults to from, empty label is null', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2030-03-16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une fermeture' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_add_closed_dates', { p_from: '2030-03-16', p_to: '2030-03-16', p_label: null })
    );
  });

  it('deletes a range', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer cette fermeture' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_delete_closed_dates', { p_id: 'c1' }));
  });
});
