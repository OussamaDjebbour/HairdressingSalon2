import { useState } from 'react';
import { useLang } from '../../context/LanguageContext';
import { toAdminError, useSetBookingStatus, type AdminBooking, type AdminVisit } from '../../data/admin';
import type { ClientMessageKind } from '../../data/whatsapp';
import { countText } from '../../data/formatters';
import { useConfirm } from './feedback';

/** A status change or move that just happened, with what the client message needs. */
export type Notice = {
  kind: ClientMessageKind;
  booking: Pick<AdminBooking, 'clientName' | 'clientPhone' | 'startsAt' | 'serviceName' | 'lang'>;
};

/**
 * Confirm or refuse/cancel a visit (the server changes every part of it); on success, `notice`
 * holds the message to offer the client and `onDone` (if given) hears which visit changed.
 * `pendingId` and `errorId` are visit ids.
 */
export function useBookingActions(onDone?: (visit: AdminVisit, status: 'confirmed' | 'cancelled') => void) {
  const { t, lang } = useLang();
  const setStatus = useSetBookingStatus();
  const ask = useConfirm();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which booking the error belongs to (a list shows it under that one only).
  const [errorId, setErrorId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const run = (v: AdminVisit, status: 'confirmed' | 'cancelled', contact: AdminBooking = v.first) => {
    setError(null);
    setErrorId(null);
    setPendingId(v.id);
    setStatus.mutate(
      { id: v.first.id, status },
      {
        onSuccess: () => {
          setPendingId(null);
          setNotice({ kind: status, booking: { ...v.first, clientName: contact.clientName, clientPhone: contact.clientPhone, lang: contact.lang, serviceName: v.serviceName } });
          onDone?.(v, status);
        },
        onError: (err) => {
          setPendingId(null);
          setError(t(`admin.error.${toAdminError(err)}`));
          setErrorId(v.id);
        },
      }
    );
  };

  return {
    /** `contact`: the booking whose client details the message uses (default: the first part). */
    confirm: (v: AdminVisit, contact?: AdminBooking) => run(v, 'confirmed', contact),
    /** Refusing a request and cancelling a booking are the same change: ask once, then free the slot. */
    refuse: async (v: AdminVisit, contact?: AdminBooking) => {
      const many = v.parts.length > 1;
      const ok = await ask({
        title: t(many ? 'admin.cancelVisit.title' : 'admin.cancelConfirm.title'),
        text: many
          ? countText(t, lang, 'admin.cancelVisit.text', v.parts.length).replace('{services}', v.serviceName[lang])
          : t('admin.cancelConfirm.text'),
        confirmLabel: t('admin.cancelConfirm.yes'),
        cancelLabel: t('admin.cancelConfirm.no'),
        danger: true,
      });
      if (ok) run(v, 'cancelled', contact);
    },
    clearError: () => { setError(null); setErrorId(null); },
    pendingId,
    error,
    errorId,
    notice,
    clearNotice: () => setNotice(null),
  };
}
