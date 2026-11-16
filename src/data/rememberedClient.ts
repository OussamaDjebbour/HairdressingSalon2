/**
 * The client's own name and phone, kept on her device after a booking so the next one is prefilled.
 * Per salon. Storage can be unavailable (private mode, blocked site data): every call fails quietly.
 */
export interface RememberedClient {
  name: string;
  phone: string;
}

const key = (salonId: string) => `salon:${salonId}:client`;

export function loadClient(salonId: string): RememberedClient | null {
  try {
    const raw = localStorage.getItem(key(salonId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<RememberedClient>;
    return typeof v.name === 'string' && typeof v.phone === 'string' ? { name: v.name, phone: v.phone } : null;
  } catch {
    return null;
  }
}

export function saveClient(salonId: string, client: RememberedClient): void {
  try {
    localStorage.setItem(key(salonId), JSON.stringify(client));
  } catch {
    // Nothing to do: the next booking simply isn't prefilled.
  }
}

export function forgetClient(salonId: string): void {
  try {
    localStorage.removeItem(key(salonId));
  } catch {
    // Same as above.
  }
}
