import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from '../lib/supabase';
import {
  algiersToday, canManageVisit, formatAlgiersTime, groupVisits, liveParts, moveVisit, isNotAuthorized, toAdminError, visitOf, useAdminBookings, useVisitParts, useCreateStaffBooking,
  useSetBookingStatus, useUpdateStaffBooking,
} from './admin';
import { toYmd } from './bookings';
import { adminBooking } from '../components/admin/fixtures';

const rpc = supabase.rpc as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('useAdminBookings', () => {
  it('requests one day and maps rows', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'b1', starts_at: '2030-01-08T08:00:00+00:00', ends_at: '2030-01-08T09:00:00+00:00',
          status: 'pending', price: 2500, client_name: 'Yasmine', client_phone: '0555123456', lang: 'fr',
          service_id: 'coupe-femme', service_name: { fr: 'Coupe & Brushing', ar: 'قص' },
          stylist_id: 'amina', stylist_name: 'Amina', created_at: '2030-01-01T00:00:00+00:00', source: 'online',
          visit_id: 'v9',
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useAdminBookings(new Date(2030, 0, 8), new Date(2030, 0, 8)), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('admin_list_bookings', { p_from: '2030-01-08', p_to: '2030-01-08' });
    const b = result.current.data![0];
    expect(b.clientName).toBe('Yasmine');
    expect(b.visitId).toBe('v9');
    expect(b.startsAt).toBeInstanceOf(Date);
    expect(formatAlgiersTime(b.startsAt)).toBe('09:00');
  });
});

describe('useAdminBookings refresh', () => {
  it('refetches every minute while the schedule stays open', async () => {
    vi.useFakeTimers();
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useAdminBookings(new Date(2030, 0, 6), new Date(2030, 0, 12)), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(rpc).toHaveBeenCalledTimes(2);
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

describe('useVisitParts', () => {
  it('asks admin_visit_parts for the booking and maps the rows', async () => {
    rpc.mockResolvedValue({
      data: [{
        id: 'b1', starts_at: '2030-01-08T08:00:00+00:00', ends_at: '2030-01-08T09:00:00+00:00', status: 'pending', price: 2500,
        client_name: 'Y', client_phone: '0555123456', lang: 'fr', service_id: 'c', service_name: { fr: 'C', ar: 'ق' },
        stylist_id: 'amina', stylist_name: 'Amina', created_at: '2030-01-01T00:00:00+00:00', source: 'online', visit_id: 'v1',
      }],
      error: null,
    });
    const { result } = renderHook(() => useVisitParts('b1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('admin_visit_parts', { p_booking_id: 'b1' });
    expect(result.current.data![0].visitId).toBe('v1');
  });
});

describe('visits', () => {
  const coupe = adminBooking({ id: 'p1', visitId: 'v1', startIso: '2030-01-08T09:00:00Z' });
  const color = adminBooking({
    id: 'p2', visitId: 'v1', startIso: '2030-01-08T10:00:00Z', price: 6000, serviceId: 'coloration',
    serviceName: { fr: 'Coloration', ar: 'صبغة' }, stylistId: 'sara', stylistName: 'Sara',
  });
  const other = adminBooking({ id: 'p3', visitId: 'v2', startIso: '2030-01-08T08:00:00Z' });

  it('groupVisits joins the parts of a visit', () => {
    const visits = groupVisits([color, other, coupe]);
    expect(visits).toHaveLength(2);
    expect(visits[0].id).toBe('v2');
    const v1 = visits[1];
    expect(v1.id).toBe('v1');
    expect(v1.parts.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(v1.price).toBe(8500);
    expect(v1.serviceName.fr).toBe('Coupe & Brushing + Coloration');
    expect(v1.serviceName.ar).toBe('قص وتصفيف + صبغة');
    expect(v1.first).toBe(coupe);
  });

  it('groupVisits keeps parts on different days in one visit', () => {
    const later = adminBooking({ id: 'p9', visitId: 'v1', startIso: '2030-01-15T09:00:00Z' });
    const v = groupVisits([later, coupe])[0];
    expect(v.parts.map((p) => p.id)).toEqual(['p1', 'p9']);
    expect(v.first).toBe(coupe);
  });

  it('visitOf finds the other parts in the pool and always keeps the booking', () => {
    const v = visitOf(color, [coupe, color, other, coupe]);
    expect(v.parts.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(visitOf(color, [other]).parts.map((p) => p.id)).toEqual(['p2']);
  });
});

describe('managing a visit', () => {
  const part = (id: string, startIso: string, status: 'pending' | 'confirmed' | 'cancelled' = 'pending') =>
    adminBooking({ id, visitId: 'v1', startIso, status });
  const visit = (...parts: ReturnType<typeof part>[]) => groupVisits(parts)[0];

  it('liveParts drops cancelled parts', () => {
    const v = visit(part('a', '2030-01-08T09:00:00Z'), part('b', '2030-01-08T10:00:00Z', 'cancelled'));
    expect(liveParts(v).map((p) => p.id)).toEqual(['a']);
  });

  it('liveParts orders same-start parts by id', () => {
    const v = visit(part('b', '2030-01-08T09:00:00Z'), part('a', '2030-01-08T09:00:00Z'), part('c', '2030-01-08T08:00:00Z'));
    expect(liveParts(v).map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('canManageVisit: two live parts → remove and move', () => {
    const v = visit(part('a', '2030-01-08T09:00:00Z'), part('b', '2030-01-08T10:00:00Z', 'confirmed'));
    expect(canManageVisit(v)).toEqual({ remove: true, move: true });
  });

  it('canManageVisit: one live part + one cancelled → neither', () => {
    const v = visit(part('a', '2030-01-08T09:00:00Z'), part('b', '2030-01-08T10:00:00Z', 'cancelled'));
    expect(canManageVisit(v)).toEqual({ remove: false, move: false });
  });

  it('canManageVisit: parts on two dates → remove only', () => {
    const v = visit(part('a', '2030-01-08T09:00:00Z'), part('b', '2030-01-15T09:00:00Z'));
    expect(canManageVisit(v)).toEqual({ remove: true, move: false });
  });

  it('canManageVisit: a cancelled visit → neither', () => {
    const v = visit(part('a', '2030-01-08T09:00:00Z', 'cancelled'), part('b', '2030-01-08T10:00:00Z', 'cancelled'));
    expect(canManageVisit(v)).toEqual({ remove: false, move: false });
  });

  it('toAdminError maps last_part, not_movable, visit_spans_days', () => {
    expect(toAdminError({ message: 'last_part' })).toBe('last_part');
    expect(toAdminError({ message: 'not_movable' })).toBe('not_movable');
    expect(toAdminError({ message: 'visit_spans_days' })).toBe('visit_spans_days');
  });

  it('moveVisit sends p_id, p_date as YYYY-MM-DD, p_time, p_stylists', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await moveVisit({ id: 'p1', date: new Date(2030, 0, 9), time: '10:30', stylists: { p1: 'amina', p2: 'sara' } });
    expect(rpc).toHaveBeenCalledWith('admin_move_visit', {
      p_id: 'p1', p_date: '2030-01-09', p_time: '10:30', p_stylists: { p1: 'amina', p2: 'sara' },
    });
  });
});
