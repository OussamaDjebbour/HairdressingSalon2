/** Links and files that help the client around her booking: directions and a calendar entry. Public code. */

/** The salon's address lines and city on one line: "12 Rue Didouche Mourad, Alger Centre 16000, Alger". */
export function addressLine(address: string, city: string): string {
  return [...address.split('\n'), city].map((s) => s.trim()).filter(Boolean).join(', ');
}

/** A Google Maps search for the salon, from its address lines and city; null without an address (a city alone isn't a place). */
export function mapsLink(address: string, city: string): string | null {
  if (!address.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine(address, city))}`;
}

/** RFC 5545 date-time in UTC: 20300108T090000Z. */
function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 text: backslash, comma, semicolon and newlines escaped. */
function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
}

/** A one-event calendar file for a visit (first part's start to last part's end). */
export function visitIcs(input: {
  salon: string;
  services: string;
  start: Date;
  end: Date;
  location: string;
  description: string;
  uid: string;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Salon//Rendez-vous//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(input.start)}`,
    `DTEND:${icsDate(input.end)}`,
    `SUMMARY:${icsText(`${input.salon} — ${input.services}`)}`,
    `LOCATION:${icsText(input.location)}`,
    `DESCRIPTION:${icsText(input.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
