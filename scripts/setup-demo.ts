/**
 * pnpm setup-demo <salon-id> [--dry-run] [--domain=<email domain>]
 *
 * Turns a salon into the showroom: creates the shared demo login (demo+<salon-id>@demo.invalid, a
 * dedicated user, never the owner's) and records the salon's CURRENT state as the snapshot the
 * nightly/on-demand reset returns to. Re-running keeps the user, ROTATES its password and
 * re-captures the snapshot, so run it when the salon looks the way prospects should see it.
 * Secrets come from the git-ignored .env.admin. See salons/README.md.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { env, fail, findUserByEmail, info, loadEnv, ok, StepFailed, supabaseClient, warn } from './lib/admin';
import { demoEmail, demoErrorMessage, generateDemoPassword, parseDemoArgs } from './lib/demo';

/** The demo auth user: created (confirmed) or, when it exists, given the new password. */
async function ensureDemoUser(supabase: SupabaseClient, email: string, password: string): Promise<string> {
  const found = await findUserByEmail(supabase, email);
  if (found) {
    const { error } = await supabase.auth.admin.updateUserById(found.id, { password, email_confirm: true });
    if (error) fail(`Rotating the demo password failed: ${error.message}`);
    ok(`Demo login ${email} already exists: password rotated`);
    return found.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) fail(`Creating the demo login failed: ${error?.message ?? 'no user returned'}`);
  ok(`Demo login ${email} created`);
  return data.user.id;
}

async function main() {
  let args: ReturnType<typeof parseDemoArgs>;
  try {
    args = parseDemoArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
  const { salonId, dryRun, domain } = args;
  const email = demoEmail(salonId, domain);

  loadEnv(true);
  const supabase = supabaseClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  const { data: salon, error: salonError } = await supabase.from('salons').select('name, demo').eq('id', salonId).maybeSingle();
  if (salonError) fail(`Reading salons failed: ${salonError.message}`);
  if (!salon) fail(demoErrorMessage('not_found', salonId, email));
  ok(`Salon "${salonId}" found: "${salon.name as string}"`);

  if (dryRun) {
    info(`Would create (or keep) the demo login ${email} and rotate its password`);
    info(`Would call setup_demo('${salonId}'): flag the salon as the demo and record its current state as the reset snapshot`);
    ok('Dry run: nothing was written');
    return;
  }

  const password = generateDemoPassword();
  const userId = await ensureDemoUser(supabase, email, password);
  // The password is changed before setup_demo, so the login demo_login hands out always works.
  const { error } = await supabase.rpc('setup_demo', { p_salon_id: salonId, p_user_id: userId, p_email: email, p_password: password });
  if (error) fail(`setup_demo: ${demoErrorMessage(error.message, salonId, email)}`);
  ok(`Salon "${salonId}" is now the demo: its current state is the snapshot the reset returns to`);

  console.log('\nSummary');
  info(`Demo login: ${email}`);
  info(`Password (shown once, the button on /admin fills it in for visitors): ${password}`);
  info('"Essayer la démo" now appears on that salon\'s /admin login page.');
  warn(`Re-running records the salon's CURRENT state as the new "original": run it when the salon looks the way prospects should see it.`);
}

main().catch((e) => {
  if (!(e instanceof StepFailed)) console.error(`✗ ${(e as Error).stack ?? e}`);
  process.exitCode = 1;
});
