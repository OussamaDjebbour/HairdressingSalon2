import { useState } from 'react';
import { useLang } from '../../context/LanguageContext';
import { toAdminError, useSetBookingStatus, type AdminBooking } from '../../data/admin';
import type { ClientMessageKind } from '../../data/whatsapp';

/** A status change or move that just happened, with what the client message needs. */
export type Notice = {
  kind: ClientMessageKind;
  booking: Pick<AdminBooking, 'clientName' | 'clientPhone' | 'startsAt' | 'serviceName' | 'lang'>;
};

/**
 * Confirm or refuse/cancel a booking; on success, `notice` holds the message to offer the client
 * and `onDone` (if given) hears which booking changed.
 */
export function useBookingActions(onDone?: (booking: AdminBooking, status: 'confirmed' | 'cancelled') => void) {
  const { t } = useLang();
  const setStatus = useSetBookingStatus();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const run = (b: AdminBooking, status: 'confirmed' | 'cancelled') => {
    setError(null);
    setPendingId(b.id);
    setStatus.mutate(
      { id: b.id, status },
      {
        onSuccess: () => {
          setPendingId(null);
          setNotice({ kind: status, booking: b });
          onDone?.(b, status);
        },
        onError: (err) => {
          setPendingId(null);
          setError(t(`admin.error.${toAdminError(err)}`));
        },
      }
    );
  };

  return {
    confirm: (b: AdminBooking) => run(b, 'confirmed'),
    /** Refusing a request and cancelling a booking are the same change: ask once, then free the slot. */
    refuse: (b: AdminBooking) => {
      if (window.confirm(t('admin.cancelConfirm'))) run(b, 'cancelled');
    },
    pendingId,
    error,
    notice,
    clearNotice: () => setNotice(null),
  };
}
