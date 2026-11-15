import { supabase } from '../lib/supabase';

/** Credentials for a demo salon's public demo account, or null when the salon isn't a demo. */
export async function fetchDemoLogin(salonId: string): Promise<{ email: string; password: string } | null> {
  const { data, error } = await supabase.rpc('demo_login', { p_salon_id: salonId });
  if (error) throw error;
  const row = (data as { email: string; password: string }[] | null)?.[0];
  return row ? { email: row.email, password: row.password } : null;
}
