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
  failedItem,
  useCreateVisit,
  useVisitSlots,
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
    expect(toBookingError({ message: 'price_changed' })).toBe('price_changed');
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

describe('useVisitSlots', () => {
  it('calls get_visit_slots with the items', async () => {
    rpc.mockResolvedValue({ data: [{ slot: '09:00', available: false, missing: [1] }], error: null });
    const items = [
      { serviceId: 'coupe-femme', stylistId: 'amina' },
      { serviceId: 'coloration', stylistId: null },
    ];
    const { result } = renderHook(() => useVisitSlots(new Date(2030, 0, 8), items), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('get_visit_slots', {
      p_salon_id: 'elegance',
      p_date: '2030-01-08',
      p_items: [
        { service_id: 'coupe-femme', stylist_id: 'amina' },
        { service_id: 'coloration', stylist_id: null },
      ],
    });
    expect(result.current.data).toEqual([{ slot: '09:00', available: false, missing: [1] }]);
  });

  it('does not fetch without items', () => {
    renderHook(() => useVisitSlots(new Date(2030, 0, 8), []), { wrapper });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('useCreateVisit', () => {
  it('returns each part', async () => {
    rpc.mockResolvedValue({
      data: [
        { booking_id: 'b1', service_id: 'coupe-femme', stylist_id: 'amina', starts_at: '2030-01-08T09:00:00+00:00' },
        { booking_id: 'b2', service_id: 'coloration', stylist_id: 'sara', starts_at: '2030-01-08T10:00:00+00:00' },
      ],
      error: null,
    });
    const { result } = renderHook(() => useCreateVisit(), { wrapper });
    let created: unknown;
    await act(async () => {
      created = await result.current.mutateAsync({
        items: [
          { serviceId: 'coupe-femme', stylistId: 'amina' },
          { serviceId: 'coloration', stylistId: null },
        ],
        date: new Date(2030, 0, 8),
        time: '09:00',
        clientName: 'Yasmine',
        clientPhone: '0555 12 34 56',
        lang: 'fr',
        expectedTotal: 8500,
      });
    });
    expect(rpc).toHaveBeenCalledWith('create_visit', {
      p_salon_id: 'elegance',
      p_items: [
        { service_id: 'coupe-femme', stylist_id: 'amina' },
        { service_id: 'coloration', stylist_id: null },
      ],
      p_date: '2030-01-08',
      p_time: '09:00',
      p_client_name: 'Yasmine',
      p_client_phone: '0555 12 34 56',
      p_lang: 'fr',
      p_expected_total: 8500,
    });
    expect(created).toEqual([
      { bookingId: 'b1', serviceId: 'coupe-femme', stylistId: 'amina', startsAt: new Date('2030-01-08T09:00:00Z') },
      { bookingId: 'b2', serviceId: 'coloration', stylistId: 'sara', startsAt: new Date('2030-01-08T10:00:00Z') },
    ]);
  });
});

describe('failedItem', () => {
  it('reads the part from the error detail', () => {
    expect(failedItem({ message: 'slot_taken', details: 'item:1' })).toBe(1);
    expect(failedItem({ message: 'slot_taken' })).toBeNull();
    expect(failedItem({ details: 'nope' })).toBeNull();
    expect(failedItem(null)).toBeNull();
  });
});

describe('toBookingError (visits)', () => {
  it('knows too_many_services', () => {
    expect(toBookingError({ message: 'too_many_services' })).toBe('too_many_services');
  });
});
