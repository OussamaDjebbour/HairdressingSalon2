import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

const rpc = vi.fn(async () => ({ data: null, error: null }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc: () => rpc() } }));

import { useSaveSalonInfo } from './salonSettings';

describe('settings writes', () => {
  it('resolve only after the affected queries have refetched (no flash of old values)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let version = 'old';
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({
        info: useQuery({
          queryKey: ['salon', 'info'],
          queryFn: () => new Promise<string>((resolve) => setTimeout(() => resolve(version), 20)),
        }),
        save: useSaveSalonInfo(),
      }),
      { wrapper }
    );
    await vi.waitFor(() => expect(result.current.info.data).toBe('old'));

    version = 'new';
    await act(() =>
      result.current.save.mutateAsync({
        address: { fr: '', ar: '' },
        city: { fr: '', ar: '' },
        whatsapp: '',
        instagramUrl: '',
        facebookUrl: '',
      })
    );
    expect(client.getQueryData(['salon', 'info'])).toBe('new');
  });
});
