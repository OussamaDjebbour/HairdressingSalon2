import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface BookingRequest {
  serviceId: string;
  /** Increments on every choice, so choosing the same service twice re-triggers. */
  seq: number;
}

interface BookingIntent {
  request: BookingRequest | null;
  chooseService: (serviceId: string) => void;
}

const noIntent: BookingIntent = { request: null, chooseService: () => {} };
const BookingIntentContext = createContext<BookingIntent>(noIntent);

/** Lets the service tiles tell the booking wizard which service was chosen. */
export function BookingIntentProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<BookingRequest | null>(null);
  const chooseService = useCallback(
    (serviceId: string) => setRequest((r) => ({ serviceId, seq: (r?.seq ?? 0) + 1 })),
    []
  );
  const value = useMemo(() => ({ request, chooseService }), [request, chooseService]);
  return <BookingIntentContext.Provider value={value}>{children}</BookingIntentContext.Provider>;
}

export const useBookingIntent = () => useContext(BookingIntentContext);
