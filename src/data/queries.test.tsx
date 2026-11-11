import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

import { supabase } from '../lib/supabase';
import { useAllServices, useAllStylists, useServices, useStylists } from './queries';

const SEEDED = [
  {
    id: 'coupe-femme',
    category: 'coiffure',
    name: { fr: 'Coupe & Brushing', ar: 'قص وتصفيف الشعر' },
    description: { fr: 'desc fr', ar: 'desc ar' },
    price: 2500,
    duration: 60,
    image: 'img',
    icon: 'scissors',
    sort_order: 0,
    active: true,
  },
];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// A chainable query builder: records every .eq() and resolves on .order().
const eq = vi.fn();
function builder(data: unknown, error: unknown = null) {
  const b = {
    select: () => b,
    eq: (...args: unknown[]) => (eq(...args), b),
    order: () => Promise.resolve({ data, error }),
  };
  (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(b);
}

const STYLIST_ROW = {
  id: 'amina',
  name: 'Amina',
  role: { fr: 'Coiffeuse', ar: 'خبيرة' },
  specialties: [],
  image: 'img',
  sort_order: 0,
  active: true,
  stylist_services: [{ service_id: 'coupe-femme' }, { service_id: 'coloration' }],
  stylist_workdays: [{ weekday: 4 }, { weekday: 2 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useServices', () => {
  it('maps rows to services, asking only for this salon\'s active ones', async () => {
    builder(SEEDED);

    const { result } = renderHook(() => useServices(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].id).toBe('coupe-femme');
    expect(result.current.data![0].name.fr).toBe('Coupe & Brushing');
    expect(result.current.data![0].active).toBe(true);
    expect(eq).toHaveBeenCalledWith('salon_id', 'elegance');
    expect(eq).toHaveBeenCalledWith('active', true);
  });

  it('surfaces an error when the query fails', async () => {
    builder(null, new Error('boom'));

    const { result } = renderHook(() => useServices(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(typeof result.current.refetch).toBe('function');
  });
});

describe('useAllServices', () => {
  it('does not filter on active', async () => {
    builder([{ ...SEEDED[0], active: false }]);

    const { result } = renderHook(() => useAllServices(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].active).toBe(false);
    expect(eq).toHaveBeenCalledWith('salon_id', 'elegance');
    expect(eq).not.toHaveBeenCalledWith('active', true);
  });
});

describe('useStylists', () => {
  it('maps offered services to serviceIds and workdays, active only', async () => {
    builder([STYLIST_ROW]);

    const { result } = renderHook(() => useStylists(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].serviceIds).toEqual(['coupe-femme', 'coloration']);
    expect(result.current.data![0].workdays).toEqual([2, 4]);
    expect(result.current.data![0].active).toBe(true);
    expect(eq).toHaveBeenCalledWith('salon_id', 'elegance');
    expect(eq).toHaveBeenCalledWith('active', true);
  });
});

describe('useAllStylists', () => {
  it('includes inactive stylists', async () => {
    builder([{ ...STYLIST_ROW, active: false }]);

    const { result } = renderHook(() => useAllStylists(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0].active).toBe(false);
    expect(eq).not.toHaveBeenCalledWith('active', true);
  });
});
