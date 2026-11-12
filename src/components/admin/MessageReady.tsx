import { MessageCircle } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { useMyRole } from '../../data/admin';
import { useSalonInfo } from '../../data/salonSettings';
import { nameInText } from '../../data/formatters';
import { clientMessage, toWaNumber, waLink } from '../../data/whatsapp';
import type { Notice } from './useBookingActions';

interface MessageReadyProps {
  notice: Notice;
  onSend(): void;
  onLater(): void;
}

/** After a confirm, cancel or move: the client's message, prepared in her language, one tap from WhatsApp. */
export function MessageReady({ notice, onSend, onLater }: MessageReadyProps) {
  const { lang, t } = useLang();
  const demo = useMyRole() === 'demo';
  const salonWhatsapp = useSalonInfo().data?.whatsapp ?? null;
  const message = clientMessage(notice.kind, notice.booking);
  // In the demo the message goes to the salon's own number, never to a client.
  // (A demo salon without a number gets no link rather than a broken one.)
  const number = demo ? (salonWhatsapp ? toWaNumber(salonWhatsapp) : null) : toWaNumber(notice.booking.clientPhone);

  return (
    <div className="space-y-4">
      <p className="text-sm text-rose-700">{t('admin.ready.lead').replace('{name}', nameInText(notice.booking.clientName, lang))}</p>
      <p
        className="rounded-2xl bg-white border border-cream-200 p-4 text-sm text-rose-800 whitespace-pre-line"
        dir={notice.booking.lang === 'ar' ? 'rtl' : 'ltr'}
      >
        {message}
      </p>
      {number && (
        <a href={waLink(number, message)} target="_blank" rel="noopener noreferrer" onClick={onSend} className="btn-whatsapp btn-lg w-full">
          <MessageCircle className="w-5 h-5" strokeWidth={1.8} aria-hidden="true" />
          {t('admin.sheet.notifyWhatsapp')}
        </a>
      )}
      <button type="button" onClick={onLater} className="tap flex items-center mx-auto px-3 text-sm text-rose-700 underline underline-offset-4 hover:text-rose-900">
        {t('admin.ready.later')}
      </button>
    </div>
  );
}
