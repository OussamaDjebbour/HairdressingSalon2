import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  const openPeriod = () => fireEvent.click(screen.getByRole('button', { name: /Période/ }));
  const day = (n: number) => screen.getByRole('button', { name: new RegExp(`\\b${n} mai 2030`) });
  const add = () => fireEvent.click(screen.getByRole('button', { name: 'Ajouter une fermeture' }));

  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('adds a range with label', async () => {
    vi.setSystemTime(new Date(2030, 4, 1, 10));
    renderIt();
    openPeriod();
    fireEvent.click(day(16));
    fireEvent.click(day(17));
    fireEvent.change(screen.getByLabelText(/Libellé/), { target: { value: 'Aïd' } });
    add();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_add_closed_dates', { p_from: '2030-05-16', p_to: '2030-05-17', p_label: 'Aïd' })
    );
  });

  it('empty submit asks for a period', async () => {
    renderIt();
    add();
    expect(await screen.findByText('Choisissez une période.')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('flags a label over 60 characters', async () => {
    vi.setSystemTime(new Date(2030, 4, 1, 10));
    renderIt();
    openPeriod();
    fireEvent.click(day(16));
    fireEvent.change(screen.getByLabelText(/Libellé/), { target: { value: 'x'.repeat(61) } });
    add();
    expect(await screen.findByText('Le libellé ne doit pas dépasser 60 caractères.')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a single click is a one-day period, empty label is null', async () => {
    vi.setSystemTime(new Date(2030, 4, 1, 10));
    renderIt();
    openPeriod();
    fireEvent.click(day(16));
    add();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_add_closed_dates', { p_from: '2030-05-16', p_to: '2030-05-16', p_label: null })
    );
  });

  it('deletes a range', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer cette fermeture' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_delete_closed_dates', { p_id: 'c1' }));
  });
});
