import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminStats } from '../../data/stats';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { LanguageProvider, useLang } from '../../context/LanguageContext';
import { pickOption } from '../../test/select';
import { StatsView } from './StatsView';

const STATS: AdminStats = {
  current: { revenue: 13500, visits: 2, pending: 1, booked_min: 270, capacity_min: 8100, clients: 2, new_clients: 1 },
  previous: { revenue: 2500, visits: 1, pending: 0, booked_min: 60, capacity_min: 8100, clients: 1, new_clients: 1 },
  stylists: [
    { id: 'amina', name: 'Amina', visits: 2, revenue: 8500, booked_min: 180, capacity_min: 2700 },
    { id: 'leila', name: 'Leila', visits: 1, revenue: 5000, booked_min: 90, capacity_min: 2700 },
    { id: 'sara', name: 'Sara', visits: 0, revenue: 0, booked_min: 0, capacity_min: 0 },
  ],
  services: [
    { id: 'coloration', name: { fr: 'Coloration & Balayage', ar: 'صبغة' }, count: 1, revenue: 6000 },
    { id: 'maquillage', name: { fr: 'Maquillage', ar: 'مكياج' }, count: 1, revenue: 5000 },
  ],
  online: { requests: 3, confirmed: 1, refused: 1, pending: 1 },
};

function renderIt(ui = <StatsView />) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LanguageProvider>{ui}</LanguageProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-09T09:00:00Z')); // Wednesday 9 January 2030, Algiers
  rpc.mockReset();
  rpc.mockResolvedValue({ data: STATS, error: null });
});
afterEach(() => vi.useRealTimers());

describe('StatsView', () => {
  it('asks for this month by default', async () => {
    renderIt();
    await screen.findByText('13 500 DA');
    expect(rpc).toHaveBeenCalledWith('admin_stats', { p_from: '2030-01-01', p_to: '2030-01-31' });
  });

  it('shows the key figures with how they moved since the previous period', async () => {
    renderIt();
    const revenue = (await screen.findByText('13 500 DA')).closest('section')!;
    expect(within(revenue).getByText("Chiffre d'affaires")).toBeInTheDocument();
    expect(within(revenue).getByText('+11 000 DA')).toBeInTheDocument();
    const visits = screen.getByText('Rendez-vous', { selector: 'h2' }).closest('section')!;
    expect(within(visits).getByText('2')).toBeInTheDocument();
    expect(within(visits).getByText('+1')).toBeInTheDocument();
    expect(within(visits).getByText('+ 1 en attente')).toBeInTheDocument();
    const occ = screen.getByText("Taux d'occupation").closest('section')!;
    expect(within(occ).getByText('3 %')).toBeInTheDocument();
    expect(within(occ).getByText('+2 pts')).toBeInTheDocument();
    const fresh = screen.getByText('Nouvelles clientes').closest('section')!;
    expect(within(fresh).getByText('1')).toBeInTheDocument();
    expect(within(fresh).getByText('sur 2 clientes')).toBeInTheDocument();
  });

  it('lists each coiffeuse with her bookings, income and occupancy', async () => {
    renderIt();
    await screen.findByText('13 500 DA');
    const rows = within(screen.getByRole('list', { name: 'Par coiffeuse' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Amina');
    expect(rows[0]).toHaveTextContent('2 rendez-vous · 8 500 DA · 7 %');
    expect(rows[2]).toHaveTextContent('Sara');
    expect(rows[2]).toHaveTextContent('0 rendez-vous · 0 DA');
  });

  it('lists the most booked services, and the online requests with the website share', async () => {
    renderIt();
    await screen.findByText('13 500 DA');
    const services = within(screen.getByRole('list', { name: 'Prestations les plus demandées' })).getAllByRole('listitem');
    expect(services.map((s) => s.textContent)).toEqual(['Coloration & Balayage1 · 6 000 DA', 'Maquillage1 · 5 000 DA']);
    expect(screen.getByText('3 demandes · 1 confirmée · 1 refusée · 1 en attente')).toBeInTheDocument();
    expect(screen.getByText('50 % des rendez-vous confirmés viennent du site')).toBeInTheDocument();
  });

  it('asks again for the chosen period', async () => {
    renderIt();
    await screen.findByText('13 500 DA');
    pickOption('Période', 'Cette semaine');
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('admin_stats', { p_from: '2030-01-07', p_to: '2030-01-13' }));
    pickOption('Période', 'Le mois dernier');
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('admin_stats', { p_from: '2029-12-01', p_to: '2029-12-31' }));
  });

  it('says so when a period has no confirmed service or online request', async () => {
    rpc.mockResolvedValue({ data: { ...STATS, services: [], online: { requests: 0, confirmed: 0, refused: 0, pending: 0 } }, error: null });
    renderIt();
    expect(await screen.findByText('Aucune prestation confirmée sur cette période.')).toBeInTheDocument();
    expect(screen.getByText('Aucune demande en ligne sur cette période.')).toBeInTheDocument();
  });

  it('offers a retry when the figures failed to load', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('13 500 DA')).toBeInTheDocument();
  });

  it('reads in Arabic', async () => {
    function ToArabic() {
      const { toggleLang } = useLang();
      return <button onClick={toggleLang}>to-ar</button>;
    }
    renderIt(<><ToArabic /><StatsView /></>);
    await screen.findByText('13 500 DA');
    fireEvent.click(screen.getByText('to-ar'));
    expect(screen.getByText('رقم الأعمال')).toBeInTheDocument();
    expect(screen.getByText('صبغة')).toBeInTheDocument();
    // one kind of digits on the whole screen, as in the prices
    const occ = screen.getByText('نسبة الإشغال').closest('section')!;
    expect(within(occ).getByText('3%')).toBeInTheDocument();
    expect(within(screen.getByText('عميلات جديدات').closest('section')!).getByText('1')).toBeInTheDocument();
  });
});
