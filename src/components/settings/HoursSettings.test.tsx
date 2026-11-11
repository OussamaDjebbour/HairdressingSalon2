import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SalonHours } from '../../data/types';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const day = { opens: 9 * 60, closes: 18 * 60 };
const hours: SalonHours = { 1: null, 2: day, 3: day, 4: day, 5: day, 6: day, 7: day };
vi.mock('../../data/salonSettings', async (orig) => ({
  ...(await orig<typeof import('../../data/salonSettings')>()),
  useSalonHours: () => ({ data: hours }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { HoursSettings } from './HoursSettings';

function renderIt() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LanguageProvider>
          <HoursSettings />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const sent = () => rpc.mock.calls.find((c) => c[0] === 'admin_set_hours')![1].p_hours;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) => (fn === 'admin_affected_bookings' ? { data: [], error: null } : { data: null, error: null }));
});

describe('HoursSettings', () => {
  it('saves all 7 days with the edited Thursday', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('Jeudi · Fermeture'), { target: { value: String(13 * 60) } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_set_hours', expect.anything()));
    const p = sent();
    expect(p).toHaveLength(7);
    expect(p[0]).toEqual({ weekday: 1, opens: null, closes: null });
    expect(p[3]).toEqual({ weekday: 4, opens: '09:00', closes: '13:00' });
  });

  it('closing Sunday sends nulls', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('switch', { name: 'Dimanche' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_set_hours', expect.anything()));
    expect(sent()[6]).toEqual({ weekday: 7, opens: null, closes: null });
  });

  it('opens >= closes shows the error and skips the RPC', () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('Mardi · Ouverture'), { target: { value: String(19 * 60) } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Les horaires sont invalides/);
    expect(rpc).not.toHaveBeenCalledWith('admin_set_hours', expect.anything());
  });
});
