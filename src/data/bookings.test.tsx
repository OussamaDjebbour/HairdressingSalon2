import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from '../lib/supabase';
import {
  isValidPhone,
  normalizePhone,
  toBookingError,
  toYmd,
  useCreateBooking,
  useSlots,
} from './bookings';

const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('phone rules (mirror of the DB)', () => {
  it.each([
    ['0555 12 34 56', '0555123456', true],
    ['+213 661 22 33 44', '0661223344', true],
    ['00213 771-22-33-44', '0771223344', true],
    ['(0555).12.34.56', '0555123456', true],
    ['021 12 34 56', '021123456', false],
    ['0855123456', '0855123456', false],
    ['', '', false],
  ])('%s → %s (valid: %s)', (input, normalized, valid) => {
    expect(normalizePhone(input)).toBe(normalized);
    expect(isValidPhone(input)).toBe(valid);
  });
});

describe('toBookingError', () => {
  it('maps known RPC error messages', () => {
    expect(toBookingError({ message: 'slot_taken', code: 'P0001' })).toBe('slot_taken');
    expect(toBookingError({ message: 'too_many_bookings' })).toBe('too_many_bookings');
    expect(toBookingError({ message: 'rate_limited' })).toBe('rate_limited');
  });
  it('falls back to unknown', () => {
    expect(toBookingError(new Error('Failed to fetch'))).toBe('unknown');
    expect(toBookingError(null)).toBe('unknown');
  });
});

describe('toYmd', () => {
  it('formats the local calendar day', () => {
    expect(toYmd(new Date(2030, 0, 8, 23, 30))).toBe('2030-01-08');
  });
});

describe('useSlots', () => {
  it('calls get_slots with the picked day, service and stylist', async () => {
    rpc.mockResolvedValue({ data: [{ slot: '09:00', available: true }], error: null });

    const { result } = renderHook(() => useSlots(new Date(2030, 0, 8), 'coupe-femme', null), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('get_slots', {
      p_salon_id: 'elegance',
      p_date: '2030-01-08',
      p_service_id: 'coupe-femme',
      p_stylist_id: null,
    });
    expect(result.current.data).toEqual([{ slot: '09:00', available: true }]);
  });

  it('does not fetch until a date is picked', () => {
    renderHook(() => useSlots(null, 'coupe-femme', null), { wrapper });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('useCreateBooking', () => {
  it('calls create_booking and returns the assigned stylist', async () => {
    rpc.mockResolvedValue({ data: [{ booking_id: 'b1', stylist_id: 'amina' }], error: null });

    const { result } = renderHook(() => useCreateBooking(), { wrapper });
    let created: unknown;
    await act(async () => {
      created = await result.current.mutateAsync({
        serviceId: 'coupe-femme',
        stylistId: null,
        date: new Date(2030, 0, 8),
        time: '09:00',
        clientName: 'Yasmine',
        clientPhone: '0555 12 34 56',
        lang: 'fr',
      });
    });

    expect(rpc).toHaveBeenCalledWith('create_booking', {
      p_salon_id: 'elegance',
      p_service_id: 'coupe-femme',
      p_stylist_id: null,
      p_date: '2030-01-08',
      p_time: '09:00',
      p_client_name: 'Yasmine',
      p_client_phone: '0555 12 34 56',
      p_lang: 'fr',
    });
    expect(created).toEqual({ bookingId: 'b1', stylistId: 'amina' });
  });

  it('rejects with the RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'slot_taken', code: 'P0001' } });

    const { result } = renderHook(() => useCreateBooking(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          serviceId: 'coupe-femme', stylistId: 'amina', date: new Date(2030, 0, 8),
          time: '09:00', clientName: 'Yasmine', clientPhone: '0555123456', lang: 'fr',
        })
      ).rejects.toMatchObject({ message: 'slot_taken' });
    });
  });
});
