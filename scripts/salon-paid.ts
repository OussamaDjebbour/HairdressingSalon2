/**
 * pnpm salon-paid                              list every salon with its paid-until date and state
 * pnpm salon-paid <salon-id> --months <1-24>   the salon paid N months: extend from the later of today and its date
 * pnpm salon-paid <salon-id> --until YYYY-MM-DD  set the last day paid for
 * pnpm salon-paid <salon-id> --stop            not billed any more: online booking is never paused
 *
 * The money is collected outside the app; this only records until when a salon has paid. Online booking pauses
 * 4 days after that date (3 days of grace) and reopens as soon as the date is extended. The demo is never billed.
 * Secrets come from the git-ignored .env.admin. See salons/README.md.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { env, fail, info, loadEnv, ok, StepFailed, supabaseClient } from './lib/admin';
import { algiersToday, nextPaidUntil, parseArgs, type SalonPaidArgs } from './lib/billing';

interface Row {
  salon_id: string;
  name: string;
  demo: boolean;
  paid_until: string | null;
  state: string;
  paused_from: string | null;
}

const STATE: Record<string, string> = {
  none: 'not billed',
  ok: 'paid',
  soon: 'due soon',
  grace: 'LATE (grace days)',
  paused: 'PAUSED (online booking off)',
};

function describe(r: Pick<Row, 'demo' | 'paid_until' | 'state' | 'paused_from'>): string {
  if (r.demo) return 'demo — never paused';
  if (!r.paid_until) return 'not billed — never paused';
  const pause = r.state === 'paused' ? `since ${r.paused_from}` : `pauses on ${r.paused_from}`;
  return `paid until ${r.paid_until} · ${STATE[r.state] ?? r.state} · ${pause}`;
}

async function list(supabase: SupabaseClient): Promise<Row[]> {
  const { data, error } = await supabase.rpc('billing_list');
  if (error) fail(`Reading the salons failed: ${error.message}`);
  return data as Row[];
}

async function save(supabase: SupabaseClient, salonId: string, until: string | null): Promise<Row> {
  const { data, error } = await supabase.rpc('billing_set', { p_salon_id: salonId, p_until: until });
  if (error) {
    if (error.message === 'not_found') fail(`No salon "${salonId}" (run pnpm salon-paid to list them)`);
    if (error.message === 'demo_salon') fail(`"${salonId}" is the demo: it is never billed`);
    fail(`Saving failed: ${error.message}`);
  }
  const st = data as { state: string; paid_until?: string; paused_from?: string };
  return { salon_id: salonId, name: '', demo: false, paid_until: st.paid_until ?? null, state: st.state, paused_from: st.paused_from ?? null };
}

async function main() {
  let args: SalonPaidArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
  loadEnv(true);
  const supabase = supabaseClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const rows = await list(supabase);
  const today = algiersToday();

  if (args.kind === 'list') {
    info(`Today in Algiers: ${today}`);
    for (const r of rows) info(`${r.salon_id} · ${r.name} · ${describe(r)}`);
    return;
  }

  const row = rows.find((r) => r.salon_id === args.salonId);
  if (!row) fail(`No salon "${args.salonId}" (run pnpm salon-paid to list them)`);
  if (row.demo) fail(`"${row.salon_id}" is the demo: it is never billed`);
  info(`${row.salon_id} · ${row.name}`);
  info(`Before: ${describe(row)}`);
  const until =
    args.kind === 'stop' ? null : args.kind === 'set' ? args.until : nextPaidUntil(row.paid_until, today, args.months);
  const after = await save(supabase, row.salon_id, until);
  ok(`After:  ${describe(after)}`);
}

main().catch((e) => {
  if (!(e instanceof StepFailed)) console.error(`✗ ${(e as Error).stack ?? e}`);
  process.exitCode = 1;
});
