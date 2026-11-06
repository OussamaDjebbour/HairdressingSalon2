import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from '../lib/supabase';
import {
  algiersToday, formatAlgiersTime, isNotAuthorized, toAdminError, useAdminBookings, useCreateStaffBooking,
  useSetBookingStatus, useUpdateStaffBooking,
} from './admin';
import { toYmd } from './bookings';

const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('useAdminBookings', () => {
  it('requests one day and maps rows', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'b1', starts_at: '2030-01-08T08:00:00+00:00', ends_at: '2030-01-08T09:00:00+00:00',
          status: 'pending', price: 2500, client_name: 'Yasmine', client_phone: '0555123456', lang: 'fr',
          service_id: 'coupe-femme', service_name: { fr: 'Coupe & Brushing', ar: 'قص' },
          stylist_id: 'amina', stylist_name: 'Amina', created_at: '2030-01-01T00:00:00+00:00', source: 'online',
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useAdminBookings(new Date(2030, 0, 8), new Date(2030, 0, 8)), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('admin_list_bookings', { p_from: '2030-01-08', p_to: '2030-01-08' });
    const b = result.current.data![0];
    expect(b.clientName).toBe('Yasmine');
    expect(b.startsAt).toBeInstanceOf(Date);
    expect(formatAlgiersTime(b.startsAt)).toBe('09:00');
  });
});

describe('useAdminBookings range', () => {
  it('requests a range and maps source', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'b2', starts_at: '2030-01-09T08:00:00+00:00', ends_at: '2030-01-09T09:00:00+00:00',
          status: 'confirmed', price: 1500, client_name: 'Rania', client_phone: '0555123457', lang: 'ar',
          service_id: 'manucure', service_name: { fr: 'Manucure', ar: 'مانيكير' },
          stylist_id: 'sara', stylist_name: 'Sara', created_at: '2030-01-01T00:00:00+00:00', source: 'staff',
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useAdminBookings(new Date(2030, 0, 6), new Date(2030, 0, 12)), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('admin_list_bookings', { p_from: '2030-01-06', p_to: '2030-01-12' });
    expect(result.current.data![0].source).toBe('staff');
  });
});

const staffInput = {
  serviceId: 'manucure', stylistId: 'sara', date: new Date(2030, 0, 8), time: '10:15',
  clientName: 'Rania', clientPhone: '0555 12 34 57', lang: 'ar' as const,
};
const staffParams = {
  p_service_id: 'manucure', p_stylist_id: 'sara', p_date: '2030-01-08', p_time: '10:15',
  p_client_name: 'Rania', p_client_phone: '0555 12 34 57', p_lang: 'ar',
};

describe('useCreateStaffBooking', () => {
  it('sends salon date and time and resolves to the new id', async () => {
    rpc.mockResolvedValue({ data: 'new-id', error: null });
    const { result } = renderHook(() => useCreateStaffBooking(), { wrapper });
    let id: string | undefined;
    await act(async () => {
      id = await result.current.mutateAsync(staffInput);
    });
    expect(rpc).toHaveBeenCalledWith('admin_create_booking', staffParams);
    expect(id).toBe('new-id');
  });
});

describe('useUpdateStaffBooking', () => {
  it('sends p_id with the same fields', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useUpdateStaffBooking(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ...staffInput, id: 'b2' });
    });
    expect(rpc).toHaveBeenCalledWith('admin_update_booking', { p_id: 'b2', ...staffParams });
  });
});

describe('toAdminError', () => {
  it('maps RPC error messages to codes', () => {
    expect(toAdminError({ message: 'slot_taken' })).toBe('slot_taken');
    expect(toAdminError({ message: 'boom' })).toBe('unknown');
    expect(toAdminError(null)).toBe('unknown');
  });
});

describe('useSetBookingStatus', () => {
  it('calls admin_set_booking_status', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useSetBookingStatus(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'b1', status: 'cancelled' });
    });
    expect(rpc).toHaveBeenCalledWith('admin_set_booking_status', { p_id: 'b1', p_status: 'cancelled' });
  });
});

describe('isNotAuthorized', () => {
  it('detects the not_authorized RPC error', () => {
    expect(isNotAuthorized({ message: 'not_authorized' })).toBe(true);
    expect(isNotAuthorized(new Error('boom'))).toBe(false);
  });
});

describe('algiersToday', () => {
  it('uses the salon calendar day, not UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-07T23:30:00Z'));
    expect(toYmd(algiersToday())).toBe('2030-01-08');
    vi.useRealTimers();
  });
});
