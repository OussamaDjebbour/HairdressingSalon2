import { useId, useState, type ReactNode } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { algiersToday } from '../../data/algiersTime';
import { countText, formatCompactRange, formatNumber, formatPrice } from '../../data/formatters';
import { compare, occupancy, statsPeriod, STATS_PERIODS, useAdminStats, type StatsPeriodKind } from '../../data/stats';
import { DataError } from '../DataError';
import { SelectField } from '../form/SelectField';

/** "+11 000 DA", "−3", "Stable": a figure's move since the previous period of the same length. */
function Trend({ move, format }: { move: ReturnType<typeof compare>; format: (n: number) => string }) {
  const { t } = useLang();
  if (!move) return null;
  const Icon = move.trend === 'up' ? TrendingUp : move.trend === 'down' ? TrendingDown : Minus;
  const tone = move.trend === 'up' ? 'text-sage-700' : move.trend === 'down' ? 'text-rust-600' : 'text-rose-700/70';
  return (
    <p className={`mt-1 flex items-center gap-1 text-sm ${tone}`}>
      <Icon className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
      <span>{move.trend === 'same' ? t('stats.same') : `${move.trend === 'up' ? '+' : '−'}${format(move.delta)}`}</span>
    </p>
  );
}

function Figure({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card !p-4">
      <h2 id={id} className="text-sm font-medium text-rose-700">{label}</h2>
      <p className="mt-1 font-display text-2xl font-semibold text-rose-900 tabular-nums">{value}</p>
      {children}
    </section>
  );
}

function Block({ title, children }: { title: string; children: (headingId: string) => ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card !p-4">
      <h2 id={id} className="font-display text-lg font-semibold text-rose-800 mb-2">{title}</h2>
      {children(id)}
    </section>
  );
}

/**
 * The owner's Statistiques for a period she picks: income, visits, occupancy and new clients (each against the
 * previous period of the same length), then per coiffeuse, the most booked services and the website's requests.
 * Totals only — the RPC never returns a client's name or phone.
 */
export function StatsView() {
  const { t, lang } = useLang();
  const [kind, setKind] = useState<StatsPeriodKind>('month');
  const period = statsPeriod(kind, algiersToday());
  const query = useAdminStats(period);
  const s = query.data;

  const price = (n: number) => formatPrice(n, lang);
  // Western digits in both languages, like the prices (DA) and the counts in sentences on this screen.
  const num = (n: number) => formatNumber(n, 'fr');
  const pct = (n: number) => (lang === 'ar' ? `${num(n)}%` : `${num(n)} %`);

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <SelectField
          id="stats-period"
          label={t('stats.period')}
          value={kind}
          options={STATS_PERIODS.map((k) => ({ value: k, label: t(`stats.period.${k}`) }))}
          onValueChange={(v) => setKind(v as StatsPeriodKind)}
        />
      </div>

      {query.isError && !s ? (
        <DataError onRetry={() => void query.refetch()} />
      ) : !s ? (
        <div className="flex justify-center py-16" aria-busy="true">
          <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
        </div>
      ) : (
        <>
          <p className="text-sm text-rose-700/80">
            {t('stats.compareNote')
              .replace('{range}', formatCompactRange(period.from, period.to, lang))
              .replace('{prev}', formatCompactRange(period.prevFrom, period.prevTo, lang))}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Figure label={t('stats.revenue')} value={price(s.current.revenue)}>
              <Trend move={compare(s.current.revenue, s.previous.revenue)} format={price} />
            </Figure>
            <Figure label={t('stats.visits')} value={num(s.current.visits)}>
              <Trend move={compare(s.current.visits, s.previous.visits)} format={num} />
              {s.current.pending > 0 && (
                <p className="mt-1 text-sm text-rose-700/80">{t('stats.pending').replace('{n}', num(s.current.pending))}</p>
              )}
            </Figure>
            {(() => {
              const now = occupancy(s.current.booked_min, s.current.capacity_min);
              const before = occupancy(s.previous.booked_min, s.previous.capacity_min);
              return (
                <Figure label={t('stats.occupancy')} value={now === null ? '—' : pct(now)}>
                  {now !== null && (
                    <Trend move={compare(now, before)} format={(n) => t('stats.points').replace('{n}', num(n))} />
                  )}
                </Figure>
              );
            })()}
            <Figure label={t('stats.newClients')} value={num(s.current.new_clients)}>
              <p className="mt-1 text-sm text-rose-700/80">{countText(t, lang, 'stats.ofClients', s.current.clients)}</p>
            </Figure>
          </div>

          <Block title={t('stats.byStylist')}>
            {(id) => (
              <ul aria-labelledby={id} className="divide-y divide-cream-200">
                {s.stylists.map((st) => {
                  const occ = occupancy(st.booked_min, st.capacity_min);
                  return (
                    <li key={st.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                      <span className="font-medium text-rose-900">{st.name}</span>
                      <span className="text-sm text-rose-700">
                        {[countText(t, lang, 'stats.bookings', st.visits), price(st.revenue), occ === null ? null : pct(occ)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          <Block title={t('stats.topServices')}>
            {(id) =>
              s.services.length === 0 ? (
                <p className="text-sm text-rose-700/80">{t('stats.noServices')}</p>
              ) : (
                <ul aria-labelledby={id} className="divide-y divide-cream-200">
                  {s.services.map((sv) => (
                    <li key={sv.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                      <span className="text-rose-900">{sv.name[lang] || sv.name.fr}</span>
                      <span className="text-sm text-rose-700 tabular-nums">{`${num(sv.count)} · ${price(sv.revenue)}`}</span>
                    </li>
                  ))}
                </ul>
              )
            }
          </Block>

          <Block title={t('stats.online')}>
            {() =>
              s.online.requests === 0 ? (
                <p className="text-sm text-rose-700/80">{t('stats.noOnline')}</p>
              ) : (
                <div className="space-y-1 text-sm text-rose-800">
                  <p>
                    {[
                      countText(t, lang, 'stats.requests', s.online.requests),
                      countText(t, lang, 'stats.confirmed', s.online.confirmed),
                      countText(t, lang, 'stats.cancelled', s.online.cancelled),
                      countText(t, lang, 'stats.waiting', s.online.pending),
                    ].join(' · ')}
                  </p>
                  {s.current.visits > 0 && (
                    <p className="text-rose-700/80">
                      {t('stats.onlineShare').replace('{pct}', num(Math.round((s.online.confirmed / s.current.visits) * 100)))}
                    </p>
                  )}
                </div>
              )
            }
          </Block>
        </>
      )}
    </div>
  );
}
