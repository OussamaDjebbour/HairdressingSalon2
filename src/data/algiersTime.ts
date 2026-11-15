const algiersTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Algiers',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "HH:MM" in salon time, whatever the viewer's timezone. */
export function formatAlgiersTime(d: Date): string {
  return algiersTime.format(d);
}

/** Today's date in salon time (Africa/Algiers), as a local-midnight Date for the day picker. */
export function algiersToday(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m, d] = parts.split('-').map(Number);
  return new Date(y, m - 1, d);
}
