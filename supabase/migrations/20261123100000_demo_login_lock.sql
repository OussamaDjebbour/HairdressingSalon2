-- The shared demo login can't be taken over. Anyone signed in as the demo could call Supabase Auth
-- (updateUser) to change its email or password and lock every other visitor out until the nightly
-- reset. Auth writes through auth.users, so the guard sits there: for a demo account, the email (and
-- any pending email change) may only become the stored login email, and the password only a hash of
-- the stored login password — exactly what private.demo_reset and pnpm setup-demo (which stores the
-- new password with setup_demo before setting it) write. A re-hash of the same password on sign-in
-- still passes. Every other account is untouched.

create function private.demo_login_lock()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email    text;
  v_password text;
begin
  select d.login_email, d.login_password into v_email, v_password
  from private.staff st
  join private.demo_settings d on d.salon_id = st.salon_id
  where st.user_id = new.id and st.role = 'demo';
  if not found then
    return new;
  end if;

  if (new.email is distinct from old.email and lower(coalesce(new.email, '')) <> lower(v_email))
     or (coalesce(new.email_change, '') <> '' and lower(new.email_change) <> lower(v_email))
     or (new.encrypted_password is distinct from old.encrypted_password
         and (coalesce(new.encrypted_password, '') = ''
              or extensions.crypt(v_password, new.encrypted_password) <> new.encrypted_password)) then
    raise exception 'demo_login_locked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.demo_login_lock() from public, anon, authenticated;

create trigger demo_login_lock
  before update of email, email_change, encrypted_password on auth.users
  for each row execute function private.demo_login_lock();
