import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

import { supabase } from '../lib/supabase';
import { useServices } from './queries';

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
  },
];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useServices', () => {
  it('maps rows to services on success', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({ order: () => Promise.resolve({ data: SEEDED, error: null }) }),
    });

    const { result } = renderHook(() => useServices(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].id).toBe('coupe-femme');
    expect(result.current.data![0].name.fr).toBe('Coupe & Brushing');
  });

  it('surfaces an error when the query fails', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({ order: () => Promise.resolve({ data: null, error: new Error('boom') }) }),
    });

    const { result } = renderHook(() => useServices(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(typeof result.current.refetch).toBe('function');
  });
});
