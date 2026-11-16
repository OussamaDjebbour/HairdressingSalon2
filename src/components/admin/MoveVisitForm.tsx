import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { formatAlgiersTime, liveParts, toAdminError, useMoveVisit, type AdminVisit } from '../../data/admin';
import { failedItem, toYmd } from '../../data/bookings';
import { useAllStylists } from '../../data/queries';
import { dayHours, stylistWorks } from '../../data/hours';
import { useClosedDates, useSalonHours, useStylistDaysOff } from '../../data/salonSettings';
import { minutesToTime, salonDate, salonInstant, staffTimeOptions } from '../../data/week';
import { DateField } from '../form/DateField';
import { SelectField } from '../form/SelectField';

interface MoveVisitFormProps {
  visit: AdminVisit;
  /** `stylists` holds only the parts whose stylist was changed. */
  onMoved(newStart: Date, stylists: Record<string, string>): void;
  onBack(): void;
  /** Tells the sheet whether there are unsaved changes (to ask before discarding). */
  onDirtyChange?(dirty: boolean): void;
}

/** Moves a whole visit to a new day and start time; the parts keep their order and gaps. */
export function MoveVisitForm({ visit, onMoved, onBack, onDirtyChange }: MoveVisitFormProps) {
  const { lang, t } = useLang();
  const allStylists = useAllStylists().data ?? [];
  const salonHours = useSalonHours().data;
  const closedDates = useClosedDates().data ?? [];
  const daysOff = useStylistDaysOff().data ?? [];
  const move = useMoveVisit();

  const live = liveParts(visit);
  const first = live[0];
  const last = live.reduce((a, p) => (p.endsAt > a.endsAt ? p : a), first);
  const span = Math.round((last.endsAt.getTime() - first.startsAt.getTime()) / 60000);

  const [date, setDate] = useState(() => salonDate(first.startsAt));
  const [time, setTime] = useState(() => formatAlgiersTime(first.startsAt));
  const [chosen, setChosen] = useState<Record<string, string>>(() => Object.fromEntries(live.map((p) => [p.id, p.stylistId])));
  const [error, setError] = useState<string | null>(null);

  const dirty =
    toYmd(date) !== toYmd(salonDate(first.startsAt)) || time !== formatAlgiersTime(first.startsAt) || live.some((p) => chosen[p.id] !== p.stylistId);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const hours = salonHours ? dayHours(salonHours, closedDates, date) : null;
  const ownTime = formatAlgiersTime(first.startsAt);
  const ownDate = salonDate(first.startsAt);
  const gridOptions = hours ? staffTimeOptions(span, hours) : [];
  // On the visit's own day its current start stays selectable (and in order) even if off the grid.
  const timeOptions =
    toYmd(date) === toYmd(ownDate) && !gridOptions.includes(ownTime)
      ? [...gridOptions, ownTime].sort((a, b) => a.localeCompare(b))
      : gridOptions;
  const [h, m] = time.split(':').map(Number);
  const start = h * 60 + m;
  // A closed day, or a kept time that doesn't fit the day (before opening, past closing, not offered): say so, don't change it.
  const pastClosing = !!salonHours && (!hours || start < hours.opens || start + span > hours.closes || !timeOptions.includes(time));

  const newTime = (offsetMin: number) => minutesToTime(start + offsetMin);
  const offsetOf = (p: (typeof live)[number]) => Math.round((p.startsAt.getTime() - first.startsAt.getTime()) / 60000);
  const stylistName = (id: string) => allStylists.find((s) => s.id === id)?.name ?? '';

  const submit = () => {
    setError(null);
    const changed = Object.fromEntries(live.filter((p) => chosen[p.id] !== p.stylistId).map((p) => [p.id, chosen[p.id]]));
    move.mutate(
      { id: first.id, date, time, stylists: changed },
      {
        onSuccess: () => onMoved(salonInstant(date, time), changed),
        onError: (err) => {
          const code = toAdminError(err);
          const n = failedItem(err);
          const part = code === 'slot_taken' && n !== null ? live[n] : undefined;
          setError(
            part
              ? t('admin.move.partTaken')
                  .replace('{service}', part.serviceName[lang])
                  .replace('{stylist}', stylistName(chosen[part.id]))
                  .replace('{time}', newTime(offsetOf(part)))
              : t(`admin.error.${code}`)
          );
        },
      }
    );
  };

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!pastClosing) submit();
      }}
    >
      <button type="button" disabled={move.isPending} onClick={onBack} className="tap -ms-1 inline-flex items-center gap-1.5 px-1 text-sm text-rose-700 hover:text-rose-900">
        <ArrowLeft className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} aria-hidden="true" />
        {t('admin.sheet.backToSummary')}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <DateField id="move-date" label={t('admin.sheet.date')} value={date} onChange={setDate} />
        <SelectField
          id="move-time"
          label={t('admin.sheet.time')}
          value={time}
          options={timeOptions.map((tm) => ({ value: tm, label: tm }))}
          onValueChange={setTime}
          dirLtrValues
        />
        {pastClosing && <p role="status" className="col-span-2 -mt-1 text-xs text-rust-700">{t('admin.error.outside_hours')}</p>}
      </div>

      <ul className="space-y-3">
        {live.map((p) => {
          const stylist = allStylists.find((s) => s.id === chosen[p.id]);
          const off = !!stylist && !stylistWorks(stylist, daysOff, date);
          return (
            <li key={p.id} className="flex items-start gap-3">
              <span dir="ltr" className="pt-8 text-sm font-semibold text-rose-900">{newTime(offsetOf(p))}</span>
              <div className="flex-1">
                <SelectField
                  id={`move-stylist-${p.id}`}
                  label={`${t('admin.sheet.stylist')} · ${p.serviceName[lang]}`}
                  value={chosen[p.id]}
                  options={allStylists.filter((s) => s.active || s.id === p.stylistId).map((s) => ({ value: s.id, label: s.name }))}
                  onValueChange={(v) => setChosen((c) => ({ ...c, [p.id]: v }))}
                />
                {off && stylist && (
                  <p role="status" className="mt-1 text-xs text-amber-800">{t('schedule.stylistOff').replace('{name}', stylist.name)}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p role="alert" className="rounded-xl border border-rust-200 bg-rust-50 px-3 py-2 text-sm text-rust-700">{error}</p>}
      <button type="submit" disabled={move.isPending || pastClosing} className="btn-primary w-full">{t('admin.move.submit')}</button>
    </form>
  );
}
