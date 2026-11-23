/** Links that help the client around her booking: directions, and which calendar to offer. Public code. */
import { joinAddress } from '../lib/calendar';

/** The salon's address lines and city on one line: "12 Rue Didouche Mourad, Alger Centre 16000, Alger". */
export const addressLine = joinAddress;

/** A Google Maps search for the salon, from its address lines and city; null without an address (a city alone isn't a place). */
export function mapsLink(address: string, city: string): string | null {
  if (!address.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine(address, city))}`;
}

/**
 * An iPhone or iPad (iPadOS reports itself as a Mac with touch): Safari opens a served .ics in its
 * "Add to Calendar" sheet, so the calendar file is the first offer there; elsewhere Google Calendar.
 */
export function isAppleMobile(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator): boolean {
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}
