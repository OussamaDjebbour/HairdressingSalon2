import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

export type Lang = 'fr' | 'ar';

interface LanguageContextValue {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: string) => string;
}

const translations: Record<Lang, Record<string, string>> = {
  fr: {
    'nav.home': 'Accueil',
    'nav.services': 'Services',
    'nav.contact': 'Contact',
    'nav.booking': 'Prendre rendez-vous',
    'nav.schedule': 'Planning du jour',
    'hero.tagline': 'Votre beauté, notre savoir-faire',
    'hero.subtitle':
      'Un salon de coiffure et beauté au cœur d\u2019Alger, où chaque visite est un moment de soin et de détente.',
    'hero.cta': 'Prendre rendez-vous',
    'hero.secondary': 'Voir les services',
    'services.title': 'Nos services',
    'services.subtitle': 'Des prestations pensées pour sublimer votre beauté',
    'services.book': 'Réserver',
    'services.from': 'À partir de',
    'services.duration': 'min',
    'trust.years': 'années d\u2019expérience',
    'trust.clients': 'clientes satisfaites',
    'trust.stylists': 'coiffeuses expertes',
    'trust.reviews': 'avis clients',
    'booking.title': 'Prendre rendez-vous',
    'booking.step.service': 'Service',
    'booking.step.stylist': 'Coiffeuse',
    'booking.step.datetime': 'Date & heure',
    'booking.step.confirm': 'Confirmation',
    'booking.selectService': 'Choisissez votre prestation',
    'booking.selectStylist': 'Choisissez votre coiffeuse',
    'booking.noPreference': 'Sans préférence',
    'booking.selectDate': 'Choisissez une date',
    'booking.selectTime': 'Créneaux disponibles',
    'booking.noSlots': 'Aucun créneau disponible pour cette date',
    'booking.summary': 'Récapitulatif',
    'booking.summary.service': 'Prestation',
    'booking.summary.stylist': 'Coiffeuse',
    'booking.summary.date': 'Date',
    'booking.summary.time': 'Heure',
    'booking.summary.duration': 'Durée',
    'booking.summary.price': 'Prix',
    'booking.confirmWhatsapp': 'Confirmer via WhatsApp',
    'booking.back': 'Retour',
    'booking.next': 'Continuer',
    'booking.confirm': 'Confirmer la réservation',
    'booking.clientName': 'Votre nom',
    'booking.clientNamePlaceholder': 'Entrez votre nom',
    'booking.clientPhone': 'Votre téléphone',
    'booking.clientPhonePlaceholder': '06 12 34 56 78',
    'booking.whatsappPreview': 'Aperçu du message WhatsApp',
    'booking.whatsappSend': 'Envoyer sur WhatsApp',
    'booking.whatsappHint':
      'Votre réservation sera envoyée au salon via WhatsApp pour confirmation finale.',
    'booking.successTitle': 'Demande envoyée !',
    'booking.successText':
      'Nous vous répondrons sur WhatsApp pour confirmer votre rendez-vous.',
    'booking.newBooking': 'Nouvelle réservation',
    'booking.duration': 'durée',
    'schedule.title': 'Planning du jour',
    'schedule.subtitle': 'Votre journée en un coup d\u2019œil',
    'schedule.today': 'Aujourd\u2019hui',
    'schedule.confirmed': 'Confirmé',
    'schedule.pending': 'En attente',
    'schedule.empty': 'Aucun rendez-vous',
    'schedule.emptyHint': 'Cette plage est libre',
    'schedule.appointments': 'rendez-vous',
    'schedule.revenue': 'Revenu estimé',
    'schedule.occupation': 'Taux d\u2019occupation',
    'schedule.nextAppt': 'Prochain rendez-vous',
    'schedule.noUpcoming': 'Aucun rendez-vous à venir',
    'contact.title': 'Contact',
    'contact.address': 'Adresse',
    'contact.hours': 'Horaires d\u2019ouverture',
    'contact.phone': 'Téléphone',
    'contact.follow': 'Suivez-nous',
    'common.with': 'avec',
    'common.at': 'à',
    'common.minutes': 'min',
    'common.tuesday': 'Mardi',
    'common.wednesday': 'Mercredi',
    'common.thursday': 'Jeudi',
    'common.friday': 'Vendredi',
    'common.saturday': 'Samedi',
    'common.sunday': 'Dimanche',
    'common.monday': 'Lundi',
    'common.closed': 'Fermé',
  },
  ar: {
    'nav.home': 'الرئيسية',
    'nav.services': 'الخدمات',
    'nav.contact': 'اتصلي بنا',
    'nav.booking': 'حجز موعد',
    'nav.schedule': 'برنامج اليوم',
    'hero.tagline': 'جمالكِ، خبرتنا',
    'hero.subtitle': 'صالون تجميل وحلاقة في قلب الجزائر العاصمة، حيث كل زيارة لحظة عناية وراحة.',
    'hero.cta': 'حجز موعد',
    'hero.secondary': 'تصفحي الخدمات',
    'services.title': 'خدماتنا',
    'services.subtitle': 'خدمات مصممة لإبراز جمالكِ',
    'services.book': 'احجزي',
    'services.from': 'ابتداءً من',
    'services.duration': 'دقيقة',
    'trust.years': 'سنوات من الخبرة',
    'trust.clients': 'عميلة سعيدة',
    'trust.stylists': 'خبيرة تجميل',
    'trust.reviews': 'تقييم العملاء',
    'booking.title': 'حجز موعد',
    'booking.step.service': 'الخدمة',
    'booking.step.stylist': 'الخبيرة',
    'booking.step.datetime': 'التاريخ والوقت',
    'booking.step.confirm': 'التأكيد',
    'booking.selectService': 'اختاري الخدمة',
    'booking.selectStylist': 'اختاري الخبيرة',
    'booking.noPreference': 'بدون تفضيل',
    'booking.selectDate': 'اختاري التاريخ',
    'booking.selectTime': 'المواعيد المتاحة',
    'booking.noSlots': 'لا توجد مواعيد متاحة في هذا التاريخ',
    'booking.summary': 'ملخص الحجز',
    'booking.summary.service': 'الخدمة',
    'booking.summary.stylist': 'الخبيرة',
    'booking.summary.date': 'التاريخ',
    'booking.summary.time': 'الوقت',
    'booking.summary.duration': 'المدة',
    'booking.summary.price': 'السعر',
    'booking.confirmWhatsapp': 'تأكيد عبر واتساب',
    'booking.back': 'رجوع',
    'booking.next': 'متابعة',
    'booking.confirm': 'تأكيد الحجز',
    'booking.clientName': 'اسمكِ',
    'booking.clientNamePlaceholder': 'أدخلي اسمكِ',
    'booking.clientPhone': 'هاتفكِ',
    'booking.clientPhonePlaceholder': '06 12 34 56 78',
    'booking.whatsappPreview': 'معاينة رسالة واتساب',
    'booking.whatsappSend': 'إرسال عبر واتساب',
    'booking.whatsappHint': 'سيتم إرسال حجزكِ إلى الصالون عبر واتساب للتأكيد النهائي.',
    'booking.successTitle': 'تم إرسال الطلب!',
    'booking.successText': 'سنرد عليكِ عبر واتساب لتأكيد موعدكِ.',
    'booking.newBooking': 'حجز جديد',
    'booking.duration': 'المدة',
    'schedule.title': 'برنامج اليوم',
    'schedule.subtitle': 'يومكِ بنظرة واحدة',
    'schedule.today': 'اليوم',
    'schedule.confirmed': 'مؤكد',
    'schedule.pending': 'في الانتظار',
    'schedule.empty': 'لا يوجد مواعيد',
    'schedule.emptyHint': 'هذه الفترة فارغة',
    'schedule.appointments': 'مواعيد',
    'schedule.revenue': 'الدخل المقدر',
    'schedule.occupation': 'معدل الإشغال',
    'schedule.nextAppt': 'الموعد القادم',
    'schedule.noUpcoming': 'لا مواعيد قادمة',
    'contact.title': 'اتصلي بنا',
    'contact.address': 'العنوان',
    'contact.hours': 'ساعات العمل',
    'contact.phone': 'الهاتف',
    'contact.follow': 'تابعينا',
    'common.with': 'مع',
    'common.at': 'في',
    'common.minutes': 'دقيقة',
    'common.tuesday': 'الثلاثاء',
    'common.wednesday': 'الأربعاء',
    'common.thursday': 'الخميس',
    'common.friday': 'الجمعة',
    'common.saturday': 'السبت',
    'common.sunday': 'الأحد',
    'common.monday': 'الإثنين',
    'common.closed': 'مغلق',
  },
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('fr');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const toggleLang = useCallback(() => {
    setLang((prev) => (prev === 'fr' ? 'ar' : 'fr'));
  }, []);

  const t = useCallback(
    (key: string) => translations[lang][key] ?? translations.fr[key] ?? key,
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, dir, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
