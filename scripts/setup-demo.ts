/**
 * pnpm setup-demo <salon-id> [--dry-run] [--domain=<email domain>] [--yes=<salon-id>] [--force]
 *
 * Turns a salon into the showroom: creates the shared demo login (demo+<salon-id>@demo.invalid, a
 * dedicated user, never the owner's) and records the salon's CURRENT state as the snapshot the
 * nightly/on-demand reset returns to. Re-running keeps the user, ROTATES its password and
 * re-captures the snapshot, so run it when the salon looks the way prospects should see it.
 *
 * Before writing it shows the salon (name, future bookings, owners, demo or not) and asks for the
 * salon id to be typed (or --yes=<salon-id> without a terminal). It refuses a salon that is not the
 * demo yet and has future online bookings (a real salon: the reset would delete them) unless --force.
 * Secrets come from the git-ignored .env.admin. See salons/README.md.
 */
import { createInterface } from 'node:readline/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env, fail, findUserByEmail, info, loadEnv, ok, StepFailed, supabaseClient, warn } from './lib/admin';
import {
  configureDemoLogin, confirmationStep, demoEmail, demoErrorMessage, describePreflight, generateDemoPassword,
  parseDemoArgs, preflightRefusal, typedConfirmationMatches, type DemoLoginOps, type DemoPreflight,
} from './lib/demo';

/** The Supabase calls behind configureDemoLogin (service role). */
function demoLoginOps(supabase: SupabaseClient, salonId: string, email: string): DemoLoginOps {
  return {
    findUser: (e) => findUserByEmail(supabase, e),
    async createUser(e, password) {
      const { data, error } = await supabase.auth.admin.createUser({ email: e, password, email_confirm: true });
      if (error || !data.user) return { error: error?.message ?? 'no user returned' };
      return { id: data.user.id };
    },
    async setupDemo(userId, password) {
      const { error } = await supabase.rpc('setup_demo', { p_salon_id: salonId, p_user_id: userId, p_email: email, p_password: password });
      return error ? error.message : null;
    },
    async setPassword(userId, password) {
      const { error } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
      return error ? error.message : null;
    },
  };
}

async function askSalonId(salonId: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return typedConfirmationMatches(await rl.question(`Type the salon id (${salonId}) to confirm: `), salonId);
  } finally {
    rl.close();
  }
}

async function main() {
  let args: ReturnType<typeof parseDemoArgs>;
  try {
    args = parseDemoArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
  const { salonId, dryRun, domain, yes, force } = args;
  const email = demoEmail(salonId, domain);

  loadEnv(true);
  const supabase = supabaseClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  const { data: rows, error: preflightError } = await supabase.rpc('demo_preflight', { p_salon_id: salonId });
  if (preflightError) fail(`Reading the salon failed: ${preflightError.message}`);
  const salon = (rows as DemoPreflight[] | null)?.[0];
  if (!salon) fail(demoErrorMessage('not_found', salonId, email));
  ok(`Salon "${salonId}" found`);
  for (const line of describePreflight(salonId, salon)) info(line);

  const refusal = preflightRefusal(salonId, salon, force);
  if (refusal) fail(refusal);
  if (force && !salon.demo && salon.future_online_bookings > 0) {
    warn(`--force: the first reset will delete the ${salon.future_bookings} future bookings of "${salonId}"`);
  }

  if (dryRun) {
    info(`Would create (or keep) the demo login ${email} and rotate its password`);
    info(`Would call setup_demo('${salonId}'): flag the salon as the demo and record its current state as the reset snapshot`);
    ok('Dry run: nothing was written');
    return;
  }

  warn(`The demo reset (nightly, or "Réinitialiser la démo") DELETES every booking, closed date and day off of "${salonId}".`);
  const step = confirmationStep({ salonId, yes, isTTY: Boolean(process.stdin.isTTY) });
  if (step.kind === 'refuse') fail(step.message);
  if (step.kind === 'prompt' && !(await askSalonId(salonId))) fail('The salon id did not match: nothing was written');

  const password = generateDemoPassword();
  const result = await configureDemoLogin(demoLoginOps(supabase, salonId, email), email, password);
  if (!result.ok) {
    fail(result.step === 'create'
      ? `Creating the demo login failed: ${result.error}`
      : `setup_demo: ${demoErrorMessage(result.error, salonId, email)}`);
  }
  ok(result.created ? `Demo login ${email} created` : `Demo login ${email} already exists`);
  ok(`Salon "${salonId}" is now the demo: its current state is the snapshot the reset returns to`);
  if (result.passwordError) {
    warn(`Setting the new password on the demo login failed (${result.passwordError}). The new password is stored, ` +
      `so "Essayer la démo" will not work until the next reset: run "Réinitialiser la démo" now (it restores the stored password).`);
  } else if (!result.created) {
    ok('Demo password rotated');
  }

  console.log('\nSummary');
  info(`Demo login: ${email}`);
  info(`Password (shown once, the button on /admin fills it in for visitors): ${password}`);
  info('"Essayer la démo" now appears on that salon\'s /admin login page.');
  warn(`Re-running records the salon's CURRENT state as the new "original": tap "Réinitialiser la démo" first, make your changes, then re-run immediately.`);
}

main().catch((e) => {
  if (!(e instanceof StepFailed)) console.error(`✗ ${(e as Error).stack ?? e}`);
  process.exitCode = 1;
});
