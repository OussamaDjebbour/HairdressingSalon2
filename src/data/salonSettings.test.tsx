import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

import { supabase } from '../lib/supabase';
import {
  toSettingsError,
  useAffectedBookings,
  useClosedDates,
  useSalonHours,
  useSalonInfo,
  useSaveSalonInfo,
  useSaveService,
  useSetHours,
} from './salonSettings';

const from = supabase.from as ReturnType<typeof vi.fn>;
const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useSalonHours', () => {
  it('maps time rows to minutes, with missing and closed weekdays as null', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { weekday: 2, opens: '09:00:00', closes: '18:00:00' },
        { weekday: 3, opens: '09:15:00', closes: '12:30:00' },
        { weekday: 7, opens: null, closes: null },
      ],
      error: null,
    });
    from.mockReturnValue({ select: () => ({ eq }) });

    const { result } = renderHook(() => useSalonHours(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith('salon_hours');
    expect(eq).toHaveBeenCalledWith('salon_id', 'elegance');
    expect(result.current.data).toEqual({
      1: null,
      2: { opens: 540, closes: 1080 },
      3: { opens: 555, closes: 750 },
      4: null,
      5: null,
      6: null,
      7: null,
    });
  });
});

describe('useClosedDates', () => {
  it('only asks for ranges ending today or later', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: 'c1', starts_on: '2030-01-08', ends_on: '2030-01-10', label: 'Aïd' }],
      error: null,
    });
    const gte = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ gte });
    from.mockReturnValue({ select: () => ({ eq }) });

    const { result } = renderHook(() => useClosedDates(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eq).toHaveBeenCalledWith('salon_id', 'elegance');
    expect(gte).toHaveBeenCalledWith('ends_on', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(result.current.data).toEqual([{ id: 'c1', from: '2030-01-08', to: '2030-01-10', label: 'Aïd' }]);
  });
});

describe('useSalonInfo', () => {
  it('maps the salon row', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        address: { fr: 'Rue 1', ar: 'شارع 1' },
        city: { fr: 'Alger', ar: 'الجزائر' },
        whatsapp: '0561234567',
        instagram_url: null,
        facebook_url: 'https://facebook.com/x',
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ single });
    from.mockReturnValue({ select: () => ({ eq }) });

    const { result } = renderHook(() => useSalonInfo(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eq).toHaveBeenCalledWith('id', 'elegance');
    expect(result.current.data).toEqual({
      address: { fr: 'Rue 1', ar: 'شارع 1' },
      city: { fr: 'Alger', ar: 'الجزائر' },
      whatsapp: '0561234567',
      instagramUrl: null,
      facebookUrl: 'https://facebook.com/x',
    });
  });
});

describe('useAffectedBookings', () => {
  it('does not call the RPC while disabled, then maps rows', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'b1', starts_at: '2030-01-08T09:00:00Z', client_name: 'Yasmine', reason: 'closed' }],
      error: null,
    });
    const { result, rerender } = renderHook(({ on }) => useAffectedBookings(on), {
      wrapper,
      initialProps: { on: false },
    });
    expect(rpc).not.toHaveBeenCalled();

    rerender({ on: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('admin_affected_bookings');
    expect(result.current.data).toEqual([
      { id: 'b1', startsAt: new Date('2030-01-08T09:00:00Z'), clientName: 'Yasmine', reason: 'closed' },
    ]);
  });
});

describe('mutations', () => {
  it('useSetHours sends 7 weekday rows as HH:MM and invalidates the salon queries', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSetHours(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        1: null, 2: { opens: 540, closes: 1080 }, 3: { opens: 555, closes: 750 }, 4: null, 5: null, 6: null, 7: null,
      });
    });

    expect(rpc).toHaveBeenCalledWith('admin_set_hours', {
      p_hours: [
        { weekday: 1, opens: null, closes: null },
        { weekday: 2, opens: '09:00', closes: '18:00' },
        { weekday: 3, opens: '09:15', closes: '12:30' },
        { weekday: 4, opens: null, closes: null },
        { weekday: 5, opens: null, closes: null },
        { weekday: 6, opens: null, closes: null },
        { weekday: 7, opens: null, closes: null },
      ],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['salon'] });
  });

  it('useSaveService uses the RPC parameter names and invalidates the catalogue', async () => {
    rpc.mockResolvedValue({ data: 'svc-1', error: null });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSaveService(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: null,
        name: { fr: 'Coupe', ar: 'قص' },
        description: null,
        category: 'coiffure',
        price: 2500,
        duration: 60,
        sortOrder: 3,
      });
    });

    expect(rpc).toHaveBeenCalledWith('admin_save_service', {
      p_id: null,
      p_name: { fr: 'Coupe', ar: 'قص' },
      p_description: null,
      p_category: 'coiffure',
      p_price: 2500,
      p_duration: 60,
      p_sort_order: 3,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['services'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['stylists'] });
  });

  it('surfaces the RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid_price' } });
    const { result } = renderHook(() => useSaveService(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          id: null, name: { fr: 'x', ar: '' }, description: null, category: 'coiffure', price: -1, duration: 60, sortOrder: null,
        })
      ).rejects.toMatchObject({ message: 'invalid_price' });
    });
  });
});

describe('toSettingsError', () => {
  it('maps known codes and falls back to unknown', () => {
    expect(toSettingsError({ message: 'invalid_hours' })).toBe('invalid_hours');
    expect(toSettingsError({ message: 'invalid_phone' })).toBe('invalid_phone');
    expect(toSettingsError({ message: 'boom' })).toBe('unknown');
    expect(toSettingsError(null)).toBe('unknown');
  });
});

describe('settings writes', () => {
  it('resolve only after the affected queries have refetched (no flash of old values)', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    let version = 'old';
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
    await waitFor(() => expect(result.current.info.data).toBe('old'));

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
