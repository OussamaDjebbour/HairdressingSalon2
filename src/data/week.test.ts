import { describe, it, expect } from 'vitest';
import type { AdminBooking } from './admin';
import { toYmd } from './bookings';
import { dayOccupancy, minutesToTime, salonMinutes, staffTimeOptions, weekDays } from './week';

const HOURS = { opens: 540, closes: 1080 };

function booking(startIso: string, minutes: number, status: AdminBooking['status'] = 'confirmed'): AdminBooking {
  const startsAt = new Date(startIso);
  return {
    id: startIso, startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60000), status, price: 2500,
    clientName: 'Yasmine', clientPhone: '0555123456', lang: 'fr', serviceId: 'coupe-femme',
    serviceName: { fr: 'Coupe', ar: 'قص' }, stylistId: 'amina', stylistName: 'Amina', source: 'online',
    createdAt: startsAt,
  };
}

describe('weekDays', () => {
  it('returns Sunday to Saturday around the day', () => {
    const days = weekDays(new Date(2030, 0, 8));
    expect(days).toHaveLength(7);
    expect(toYmd(days[0])).toBe('2030-01-06');
    expect(toYmd(days[6])).toBe('2030-01-12');
  });
});

describe('dayOccupancy', () => {
  it('divides booked minutes by opening minutes of every stylist, ignoring cancelled ones', () => {
    const bookings = [
      booking('2030-01-08T09:00:00Z', 60),
      booking('2030-01-08T13:00:00Z', 60),
      booking('2030-01-08T10:00:00Z', 60, 'cancelled'),
      booking('2030-01-09T09:00:00Z', 60),
    ];
    expect(dayOccupancy(bookings, new Date(2030, 0, 8), 3, HOURS)).toBeCloseTo(120 / 1620);
    expect(dayOccupancy(bookings, new Date(2030, 0, 8), 0, HOURS)).toBe(0);
    expect(dayOccupancy(bookings, new Date(2030, 0, 8), 3, null)).toBe(0);
  });
});

describe('staffTimeOptions', () => {
  it('lists 15-minute steps that end by closing time', () => {
    const options = staffTimeOptions(60, HOURS);
    expect(options.slice(0, 2)).toEqual(['09:00', '09:15']);
    expect(options[options.length - 1]).toBe('17:00');
    expect(options).toHaveLength(33);
  });

  it('follows the day hours', () => {
    const options = staffTimeOptions(60, { opens: 555, closes: 780 });
    expect(options[0]).toBe('09:15');
    expect(options[options.length - 1]).toBe('12:00');
  });
});

describe('salon time helpers', () => {
  it('reads minutes in Algiers time and formats them back', () => {
    expect(salonMinutes(new Date('2030-01-08T09:00:00Z'))).toBe(600);
    expect(minutesToTime(615)).toBe('10:15');
  });
});
