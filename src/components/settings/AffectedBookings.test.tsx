import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let rows: unknown[] = [];
vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: async () => ({ data: rows, error: null }) },
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { AffectedBookings } from './AffectedBookings';

function renderIt() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <LanguageProvider>
          <AffectedBookings />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  rows = [];
});

describe('AffectedBookings', () => {
  it('renders nothing when the list is empty', async () => {
    renderIt();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Ces rendez-vous/)).not.toBeInTheDocument();
  });

  it('lists each booking with Algiers date, time, client, reason and deep link', async () => {
    // 23:30 UTC on 7 Jan is 00:30 on 8 Jan in Algiers (UTC+1).
    rows = [
      { id: 'b1', starts_at: '2030-01-07T23:30:00Z', client_name: 'Sara', reason: 'closed' },
      { id: 'b2', starts_at: '2030-01-08T10:00:00Z', client_name: 'Lina', reason: 'stylist_off' },
    ];
    renderIt();
    expect(await screen.findByText(/Ces rendez-vous ne respectent plus/)).toBeInTheDocument();
    const first = screen.getByRole('link', { name: /Sara/ });
    expect(first).toHaveAttribute('href', '/admin?day=2030-01-08&booking=b1');
    expect(first).toHaveTextContent('00:30');
    expect(first).toHaveTextContent('Salon fermé ce jour-là');
    expect(screen.getByRole('link', { name: /Lina/ })).toHaveTextContent('Coiffeuse absente');
  });
});
