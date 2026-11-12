import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SalonHours } from '../../data/types';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const day = { opens: 9 * 60, closes: 18 * 60 };
const hours: SalonHours = { 1: null, 2: day, 3: day, 4: day, 5: day, 6: day, 7: day };
let hoursQuery: { data?: SalonHours; isError: boolean; refetch: () => void } | null = null;
vi.mock('../../data/salonSettings', async (orig) => ({
  ...(await orig<typeof import('../../data/salonSettings')>()),
  useSalonHours: () => hoursQuery ?? { data: hours },
}));

import { pickOption } from '../../test/select';
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
  hoursQuery = null;
});

describe('HoursSettings without hours data', () => {
  it('shows a retry instead of a blank screen when loading failed', () => {
    const refetch = vi.fn();
    hoursQuery = { data: undefined, isError: true, refetch };
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('HoursSettings', () => {
  it('saves all 7 days with the edited Thursday', async () => {
    renderIt();
    pickOption('Jeudi · Fermeture', '13:00');
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

  it('names each day switch by the day and reveals the times when turned on', () => {
    renderIt();
    for (const d of ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']) {
      expect(screen.getByRole('switch', { name: d })).toBeInTheDocument();
    }
    expect(screen.queryByRole('combobox', { name: 'Lundi · Ouverture' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Lundi' }));
    expect(screen.getByRole('combobox', { name: 'Lundi · Ouverture' })).toHaveTextContent('09:00');
    expect(screen.getByRole('combobox', { name: 'Lundi · Fermeture' })).toHaveTextContent('18:00');
  });

  it('opens >= closes shows the error under that day and skips the RPC', async () => {
    renderIt();
    pickOption('Mardi · Ouverture', '18:00');
    pickOption('Mardi · Fermeture', '09:00');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const closes = screen.getByRole('combobox', { name: 'Mardi · Fermeture' });
    await waitFor(() => expect(closes).toHaveAttribute('aria-invalid', 'true'));
    expect(closes).toHaveAccessibleDescription('L’heure de fermeture doit être après l’ouverture.');
    expect(closes).toHaveFocus();
    expect(screen.getByRole('combobox', { name: 'Jeudi · Fermeture' })).toHaveAttribute('aria-invalid', 'false');
    expect(rpc).not.toHaveBeenCalledWith('admin_set_hours', expect.anything());
  });

  it('shows a stored off-grid closing time as the Select value', () => {
    hoursQuery = { data: { ...hours, 4: { opens: 9 * 60, closes: 18 * 60 + 45 } }, isError: false, refetch: vi.fn() };
    renderIt();
    expect(screen.getByRole('combobox', { name: 'Jeudi · Fermeture' })).toHaveTextContent('18:45');
  });

  it('keeps an off-grid time in the payload when saved untouched', async () => {
    hoursQuery = { data: { ...hours, 4: { opens: 9 * 60, closes: 18 * 60 + 45 } }, isError: false, refetch: vi.fn() };
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_set_hours', expect.anything()));
    expect(sent()[3]).toEqual({ weekday: 4, opens: '09:00', closes: '18:45' });
  });
});
