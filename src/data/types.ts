import { Lang } from '../context/LanguageContext';

export interface Service {
  id: string;
  category: string;
  name: Record<Lang, string>;
  description: Record<Lang, string>;
  price: number;
  duration: number;
  image: string;
  icon: string;
  active: boolean;
}

export interface Stylist {
  id: string;
  name: string;
  role: Record<Lang, string>;
  specialties: Record<Lang, string>[];
  image: string;
  serviceIds: string[];
  active: boolean;
  /** ISO weekdays the stylist works. */
  workdays: Weekday[];
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Opening and closing time, in minutes since midnight. */
export interface DayHours {
  opens: number;
  closes: number;
}

/** A weekday maps to its hours, or null when the salon is closed that day. */
export type SalonHours = Record<Weekday, DayHours | null>;

/** A closed range, both ends inclusive (YYYY-MM-DD). */
export interface ClosedDates {
  id: string;
  from: string;
  to: string;
  label: string | null;
}

export interface SalonInfo {
  address: Record<Lang, string>;
  city: Record<Lang, string>;
  /** Local form, e.g. '0555 12 34 56'. */
  whatsapp: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
}

export interface StylistDayOff {
  id: string;
  stylistId: string;
  from: string;
  to: string;
}

export type AffectedReason = 'closed' | 'outside_hours' | 'service_hidden' | 'stylist_hidden' | 'stylist_off';

export interface AffectedBooking {
  id: string;
  startsAt: Date;
  clientName: string;
  reason: AffectedReason;
}
