import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { toYmd } from '../../data/bookings';
import { formatDayName, formatLongDate } from '../../data/formatters';
import { useAllServices, useAllStylists } from '../../data/queries';
import {
  toSettingsError,
  useAddStylistDaysOff,
  useDeleteStylistDaysOff,
  useSaveStylist,
  useSetStylistActive,
  useStylistDaysOff,
} from '../../data/salonSettings';
import type { Stylist, Weekday } from '../../data/types';
import { salonDate } from '../../data/week';
import { AffectedBookings } from './AffectedBookings';

const ERROR_KEYS = ['invalid_name', 'invalid_weekday', 'invalid_dates', 'unknown_service', 'not_found', 'not_authorized'];
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** A date that falls on the given ISO weekday (2024-01-01 is a Monday), for day-name labels. */
const dateOfWeekday = (iso: Weekday) => new Date(2024, 0, iso);
const parseYmd = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

interface Draft {
  id: string | null;
  name: string;
  roleFr: string;
  roleAr: string;
  serviceIds: string[];
  workdays: Weekday[];
}

const emptyDraft: Draft = { id: null, name: '', roleFr: '', roleAr: '', serviceIds: [], workdays: [] };

const toDraft = (s: Stylist): Draft => ({
  id: s.id,
  name: s.name,
  roleFr: s.role.fr,
  roleAr: s.role.ar,
  serviceIds: [...s.serviceIds],
  workdays: [...s.workdays],
});

export function StylistsSettings() {
  const { t, lang } = useLang();
  const { data: stylists = [] } = useAllStylists();
  const { data: services = [] } = useAllServices();
  const { data: daysOff = [] } = useStylistDaysOff();
  const save = useSaveStylist();
  const setActive = useSetStylistActive();
  const addOff = useAddStylistDaysOff();
  const delOff = useDeleteStylistDaysOff();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAffected, setShowAffected] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fail = (err: unknown) => {
    const code = toSettingsError(err);
    setError(t(`settings.error.${ERROR_KEYS.includes(code) ? code : 'unknown'}`));
  };

  const ordered = [...stylists.filter((s) => s.active), ...stylists.filter((s) => !s.active)];
  const today = toYmd(salonDate(new Date()));

  const open = (d: Draft) => {
    setError(null);
    setFrom('');
    setTo('');
    setDraft(d);
  };

  const submit = () => {
    if (!draft) return;
    setError(null);
    save.mutate(
      {
        id: draft.id,
        name: draft.name.trim(),
        role: { fr: draft.roleFr.trim(), ar: draft.roleAr.trim() },
        serviceIds: draft.serviceIds,
        workdays: draft.workdays,
      },
      {
        onSuccess: () => {
          setDraft(null);
          setShowAffected(true);
        },
        onError: fail,
      }
    );
  };

  const toggleActive = (s: Stylist) => {
    setError(null);
    setActive.mutate({ id: s.id, active: !s.active }, { onSuccess: () => setShowAffected(true), onError: fail });
  };

  const addDayOff = () => {
    if (!draft?.id || !from) return setError(t('settings.error.invalid_dates'));
    setError(null);
    addOff.mutate(
      { stylistId: draft.id, from, to: to || from },
      {
        onSuccess: () => {
          setFrom('');
          setTo('');
          setShowAffected(true);
        },
        onError: fail,
      }
    );
  };

  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  if (draft) {
    const linked = new Set(draft.serviceIds);
    const offered = services.filter((s) => s.active || linked.has(s.id));
    const upcoming = daysOff.filter((d) => d.stylistId === draft.id && d.to >= today);
    return (
      <div className="space-y-5">
        {showAffected && <AffectedBookings />}
        <form
          className="card p-4 sm:p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h2 className="font-display text-lg font-semibold text-rose-800">
            {t(draft.id ? 'settings.stylists.edit' : 'settings.stylists.new')}
          </h2>
          <div>
            <label htmlFor="sty-name" className="label">{t('settings.stylists.name')}</label>
            <input id="sty-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="sty-role-fr" className="label">{t('settings.stylists.roleFr')}</label>
            <input id="sty-role-fr" className="input" value={draft.roleFr} onChange={(e) => setDraft({ ...draft, roleFr: e.target.value })} />
          </div>
          <div>
            <label htmlFor="sty-role-ar" className="label">{t('settings.stylists.roleAr')}</label>
            <input id="sty-role-ar" className="input" dir="rtl" value={draft.roleAr} onChange={(e) => setDraft({ ...draft, roleAr: e.target.value })} />
          </div>

          <fieldset>
            <legend className="label">{t('settings.stylists.services')}</legend>
            <ul className="space-y-1">
              {offered.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-3 min-h-11 text-rose-800">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-rose-600"
                      checked={linked.has(s.id)}
                      onChange={() => setDraft({ ...draft, serviceIds: toggleIn(draft.serviceIds, s.id) })}
                    />
                    <span>{s.name[lang]}{!s.active && <span className="ms-2 text-xs font-semibold text-amber-800">{t('settings.services.hidden')}</span>}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset>
            <legend className="label">{t('settings.stylists.workdays')}</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = draft.workdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    className={`${on ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                    onClick={() => setDraft({ ...draft, workdays: toggleIn(draft.workdays, d).sort() })}
                  >
                    {formatDayName(dateOfWeekday(d), lang)}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error && <p role="alert" className="text-sm text-rust-600">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1" disabled={save.isPending}>{t('settings.services.save')}</button>
            <button type="button" className="btn-secondary flex-1" onClick={() => { setDraft(null); setError(null); }}>{t('settings.services.cancel')}</button>
          </div>
        </form>

        {draft.id && (
          <section className="card p-4 sm:p-5 space-y-3">
            <h3 className="font-display text-base font-semibold text-rose-800">{t('settings.stylists.daysOff')}</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-rose-600">{t('settings.stylists.noDaysOff')}</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-rose-800">
                    <span data-testid="day-off">
                      {d.from === d.to
                        ? formatLongDate(parseYmd(d.from), lang)
                        : `${formatLongDate(parseYmd(d.from), lang)} → ${formatLongDate(parseYmd(d.to), lang)}`}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost btn-sm shrink-0"
                      aria-label={t('settings.stylists.deleteDayOff')}
                      disabled={delOff.isPending}
                      onClick={() => delOff.mutate({ id: d.id }, { onError: fail })}
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.8} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="off-from" className="label">{t('settings.stylists.offFrom')}</label>
                <input id="off-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label htmlFor="off-to" className="label">{t('settings.stylists.offTo')}</label>
                <input id="off-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn-secondary w-full" disabled={addOff.isPending} onClick={addDayOff}>
              {t('settings.stylists.addDayOff')}
            </button>
          </section>
        )}
      </div>
    );
  }

  return (
    <div>
      {showAffected && <AffectedBookings />}
      {error && <p role="alert" className="text-sm text-rust-600 mb-3">{error}</p>}
      <button type="button" className="btn-primary w-full mb-4" onClick={() => open(emptyDraft)}>
        <Plus className="w-4 h-4" strokeWidth={2} aria-hidden /> {t('settings.services.add')}
      </button>
      <ul className="space-y-2">
        {ordered.map((s) => (
          <li key={s.id} className={`card flex items-center gap-2 ps-4 pe-2 py-2 ${s.active ? '' : 'opacity-70'}`}>
            <button type="button" className="flex-1 min-w-0 text-start py-1" onClick={() => open(toDraft(s))}>
              <span data-testid="stylist-name" className="block font-medium text-rose-800 truncate">{s.name}</span>
              <span className="block text-sm text-rose-600">
                {s.role[lang]}
                {!s.active && <span className="ms-2 text-xs font-semibold text-amber-800">{t('settings.stylists.hidden')}</span>}
              </span>
            </button>
            <button type="button" className="btn-ghost btn-sm shrink-0" disabled={setActive.isPending} onClick={() => toggleActive(s)}>
              {t(s.active ? 'settings.services.hide' : 'settings.services.show')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
