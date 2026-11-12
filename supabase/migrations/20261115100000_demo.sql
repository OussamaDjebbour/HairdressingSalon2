-- Part 4: the demo. A salon flagged demo is a public showroom: its demo login is handed out to
-- anyone (the data is fake), staff accounts carry a role (the product owner's own account is
-- 'owner', the shared public account is 'demo'), and demo_settings keeps the salon's original
-- state as a provision_salon payload that the nightly reset re-applies.

alter table public.salons add column demo boolean not null default false;

-- Existing staff (live: the product owner only) become owners through the default.
alter table private.staff
  add column role text not null default 'owner' check (role in ('owner', 'demo'));

-- One row per demo salon: the public login and the snapshot to reset to. Only security definer
-- functions read or write it (RLS on, no policies, no grants to the API roles).
create table private.demo_settings (
  salon_id       text primary key references public.salons on delete cascade,
  login_email    text not null,
  login_password text not null,
  snapshot       jsonb not null,
  updated_at     timestamptz not null default now()
);
alter table private.demo_settings enable row level security;
revoke all on private.demo_settings from public, anon, authenticated;

-- The caller's staff role ('owner' | 'demo'), or null when the caller is not staff.
create function private.my_role()
returns text language sql stable security definer set search_path = ''
as $$ select s.role from private.staff s where s.user_id = auth.uid() $$;

revoke execute on function private.my_role() from public, anon, authenticated;
grant execute on function private.my_role() to authenticated;

-- The caller's salon and role. Staff only (not_authorized otherwise).
create function public.admin_me()
returns table (salon_id text, role text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return query select s.salon_id, s.role from private.staff s where s.user_id = auth.uid();
end;
$$;

revoke execute on function public.admin_me() from public, anon, authenticated;
grant execute on function public.admin_me() to authenticated;

-- The public demo login: one row only for a salon whose demo flag is on, otherwise none.
create function public.demo_login(p_salon_id text)
returns table (email text, password text)
language sql stable security definer set search_path = ''
as $$
  select d.login_email, d.login_password
  from private.demo_settings d
  join public.salons s on s.id = d.salon_id
  where d.salon_id = p_salon_id and s.demo
$$;

revoke execute on function public.demo_login(text) from public, anon, authenticated;
grant execute on function public.demo_login(text) to anon, authenticated;

-- A salon's current state as a provision_salon payload (see the comment in provision_salon).
-- Every key the owner can edit is explicit, so re-applying it restores the salon even where
-- provision_salon would otherwise keep the current value of an omitted key.
create function private.salon_snapshot(p_salon_id text)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'address', s.address,
    'city', s.city,
    'whatsapp', s.whatsapp,
    'instagram_url', s.instagram_url,
    'facebook_url', s.facebook_url,
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', h.weekday,
                                          'opens', to_char(h.opens, 'HH24:MI'),
                                          'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday)
      from public.salon_hours h where h.salon_id = s.id), '[]'),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'category', x.category, 'name', x.name, 'description', x.description,
               'price', x.price, 'duration', x.duration, 'image', x.image, 'icon', x.icon,
               'sort_order', x.sort_order, 'active', x.active) order by x.sort_order, x.id)
      from public.services x where x.salon_id = s.id), '[]'),
    'stylists', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', st.id, 'name', st.name, 'role', st.role, 'specialties', st.specialties,
               'image', st.image, 'sort_order', st.sort_order, 'active', st.active,
               'services', coalesce((select jsonb_agg(ss.service_id order by ss.service_id)
                                     from public.stylist_services ss
                                     where ss.salon_id = s.id and ss.stylist_id = st.id), '[]'),
               'weekdays', coalesce((select jsonb_agg(w.weekday order by w.weekday)
                                     from public.stylist_workdays w
                                     where w.salon_id = s.id and w.stylist_id = st.id), '[]'))
             order by st.sort_order, st.id)
      from public.stylists st where st.salon_id = s.id), '[]'))
  from public.salons s
  where s.id = p_salon_id
$$;

revoke execute on function private.salon_snapshot(text) from public, anon, authenticated;

-- Makes a salon the demo: flags it, makes p_user_id its demo staff account, and stores the public
-- login and a snapshot of the salon as it is now. Only a new user or an existing 'demo' account can
-- be (re)configured: an owner is never turned into the shared demo account. p_email must be that
-- user's auth email (compared trimmed and case-insensitively; the auth email is what is stored).
-- Re-running replaces the login and the snapshot. Service role only.
-- Raises (P0001), checked in this order before any write: not_found (no such salon), staff_taken
-- (staff of another salon), owner_account (an owner of this salon), email_mismatch.
create function public.setup_demo(p_salon_id text, p_user_id uuid, p_email text, p_password text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text;
begin
  if not exists (select 1 from public.salons s where s.id = p_salon_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from private.staff s where s.user_id = p_user_id and s.salon_id <> p_salon_id) then
    raise exception 'staff_taken' using errcode = 'P0001';
  end if;
  if exists (select 1 from private.staff s where s.user_id = p_user_id and s.role = 'owner') then
    raise exception 'owner_account' using errcode = 'P0001';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if v_email is null or lower(v_email) <> lower(btrim(coalesce(p_email, ''))) then
    raise exception 'email_mismatch' using errcode = 'P0001';
  end if;

  update public.salons s set demo = true where s.id = p_salon_id;

  insert into private.staff (user_id, salon_id, role) values (p_user_id, p_salon_id, 'demo')
  on conflict (user_id) do update set role = 'demo';

  insert into private.demo_settings (salon_id, login_email, login_password, snapshot)
  values (p_salon_id, v_email, p_password, private.salon_snapshot(p_salon_id))
  on conflict (salon_id) do update set
    login_email    = excluded.login_email,
    login_password = excluded.login_password,
    snapshot       = excluded.snapshot,
    updated_at     = now();
end;
$$;

revoke execute on function public.setup_demo(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.setup_demo(text, uuid, text, text) to service_role;
