-- Part 4: the demo reset. Every night (and when the product owner taps "Réinitialiser la démo") a demo
-- salon goes back to its snapshot with a fresh week of fake bookings. It deletes data in a database
-- shared by real salons, so every function here first checks salons.demo for the salon it touches
-- and scopes every statement to that salon id.

-- Fake bookings are inserted with source 'online' or 'staff' (the owner sees both kinds), but a fake
-- online booking must never push a notification to anyone. demo_fake_bookings sets this
-- transaction-local flag while it inserts; the trigger skips it. The API roles cannot set settings
-- (no SQL access; PostgREST only sets request.*), so real bookings always notify.
-- Latest body: 20261112100300_salon_push.sql, plus the flag check.
create or replace function private.notify_new_booking()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('app.demo_fake_bookings', true) = 'on' then
    return new;
  end if;
  perform private.post_push('new_booking', (
    select jsonb_build_object(
      'id', new.id, 'client_name', new.client_name, 'starts_at', new.starts_at,
      'service_name', s.name, 'stylist_name', st.name,
      'salon_name', (select sl.name from public.salons sl where sl.id = new.salon_id))
    from public.services s, public.stylists st
    where s.id = new.service_id and st.id = new.stylist_id
  ), new.salon_id);
  return new;
exception when others then
  raise warning 'notify_new_booking failed: %', sqlerrm;
  return new;
end;
$$;

-- A deterministic number in 0 .. p_mod - 1 for a key (the fake bookings are seeded by salon + date).
create function private.demo_rand(p_key text, p_mod integer)
returns integer language sql immutable set search_path = ''
as $$ select (('x' || substr(md5(p_key), 1, 7))::bit(28)::integer) % p_mod $$;

revoke execute on function private.demo_rand(text, integer) from public, anon, authenticated;

-- Inserts fake bookings in a demo salon (not_demo otherwise) for p_days days from p_from: on each
-- open day (private.day_hours), 3 to 5 bookings of active services, each with a working active
-- stylist who offers it, on the 30-minute grid inside opening hours, never overlapping another
-- booking of that stylist. Alternately online (pending first, then pending or confirmed) and staff
-- (confirmed), so each open day has a pending one; names from a fixed list, phones from the reserved
-- range 0550000000–0550000999, price and duration from the service. Deterministic per salon and date
-- for a given catalogue. created_at is a day or more ago, so fake bookings never count toward the
-- online abuse limits (10 minutes / 1 hour windows). Returns how many it inserted.
create function private.demo_fake_bookings(p_salon_id text, p_from date, p_days integer)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_names    text[] := array['Amel', 'Yasmine', 'Nesrine', 'Lina', 'Meriem', 'Imane', 'Khadidja', 'Rania',
                             'Feriel', 'Asma', 'Lamia', 'Soumia', 'Nour', 'Samira', 'Kenza', 'Ryma', 'Hiba',
                             'Selma', 'Wafa', 'Sabrina'];
  v_prev     text := current_setting('app.demo_fake_bookings', true);
  v_day      date;
  v_key      text;
  v_opens    integer;
  v_closes   integer;
  v_stylists text[];
  v_services text[];
  v_count    integer;
  v_placed   integer;
  v_total    integer := 0;
  v_stylist  text;
  v_service  text;
  v_price    integer;
  v_duration integer;
  v_slots    integer;
  v_first    integer;
  v_min      integer;
  v_start    timestamptz;
  v_end      timestamptz;
  v_source   text;
begin
  if not exists (select 1 from public.salons s where s.id = p_salon_id and s.demo) then
    raise exception 'not_demo' using errcode = 'P0001';
  end if;
  perform set_config('app.demo_fake_bookings', 'on', true);

  for v_day in select d::date from generate_series(p_from, p_from + (p_days - 1), interval '1 day') d loop
    select h.opens_min, h.closes_min into v_opens, v_closes from private.day_hours(p_salon_id, v_day) h;
    continue when not found;
    v_stylists := array(
      select st.id from public.stylists st
      where st.salon_id = p_salon_id
        and private.stylist_works(st.id, v_day)
        and exists (select 1 from public.stylist_services ss
                    join public.services s on s.salon_id = ss.salon_id and s.id = ss.service_id
                    where ss.salon_id = p_salon_id and ss.stylist_id = st.id and s.active)
      order by st.sort_order, st.id);
    continue when cardinality(v_stylists) = 0;

    v_key := p_salon_id || ':' || v_day;
    v_count := 3 + private.demo_rand(v_key || ':count', 3);
    v_placed := 0;
    for i in 0 .. v_count - 1 loop
      <<place>>
      for k in 0 .. cardinality(v_stylists) - 1 loop
        v_stylist := v_stylists[1 + (private.demo_rand(v_key || ':' || i || ':stylist', cardinality(v_stylists)) + k)
                                    % cardinality(v_stylists)];
        v_services := array(
          select s.id from public.stylist_services ss
          join public.services s on s.salon_id = ss.salon_id and s.id = ss.service_id
          where ss.salon_id = p_salon_id and ss.stylist_id = v_stylist and s.active
          order by s.sort_order, s.id);
        for j in 0 .. cardinality(v_services) - 1 loop
          v_service := v_services[1 + (private.demo_rand(v_key || ':' || i || ':service', cardinality(v_services)) + j)
                                      % cardinality(v_services)];
          select s.price, s.duration into v_price, v_duration from public.services s
          where s.salon_id = p_salon_id and s.id = v_service;
          continue when v_duration > v_closes - v_opens;
          v_slots := (v_closes - v_opens - v_duration) / 30 + 1;
          v_first := private.demo_rand(v_key || ':' || i || ':time', v_slots);
          for m in 0 .. v_slots - 1 loop
            v_min := v_opens + 30 * ((v_first + m) % v_slots);
            v_start := private.slot_start(v_day, make_time(v_min / 60, v_min % 60, 0));
            v_end := v_start + make_interval(mins => v_duration);
            continue when exists (
              select 1 from private.bookings b
              where b.stylist_id = v_stylist and b.status <> 'cancelled'
                and tstzrange(b.starts_at, b.ends_at) && tstzrange(v_start, v_end));
            v_source := case when v_placed % 2 = 0 then 'online' else 'staff' end;
            begin
              insert into private.bookings
                (salon_id, service_id, stylist_id, starts_at, ends_at, price, client_name, client_phone, lang,
                 status, source, created_at)
              values
                (p_salon_id, v_service, v_stylist, v_start, v_end, v_price,
                 v_names[1 + private.demo_rand(v_key || ':' || i || ':name', cardinality(v_names))],
                 '0550000' || lpad(private.demo_rand(v_key || ':' || i || ':phone', 1000)::text, 3, '0'),
                 case when private.demo_rand(v_key || ':' || i || ':lang', 3) = 0 then 'ar' else 'fr' end,
                 case when v_source = 'online' and (v_placed = 0 or private.demo_rand(v_key || ':' || i || ':status', 2) = 0)
                      then 'pending' else 'confirmed' end,
                 v_source,
                 now() - make_interval(hours => 24 + private.demo_rand(v_key || ':' || i || ':created', 72)));
            exception when exclusion_violation then
              continue; -- a real booking took this time since the check: try the next one
            end;
            v_placed := v_placed + 1;
            exit place;
          end loop;
        end loop;
      end loop place;
    end loop;
    v_total := v_total + v_placed;
  end loop;

  perform set_config('app.demo_fake_bookings', coalesce(v_prev, ''), true);
  return v_total;
end;
$$;

revoke execute on function private.demo_fake_bookings(text, date, integer) from public, anon, authenticated;

-- Resets a demo salon (not_demo for any other salon) in one transaction: its bookings, closed dates,
-- stylists' days off and its demo accounts' push subscriptions are deleted; services and stylists
-- the snapshot doesn't list are deleted; the snapshot is re-applied through provision_salon (without
-- domains or staff keys, so neither is ever touched); the demo accounts' login is restored to the
-- public one (a prospect could change the shared account's email or password); then a week of fake
-- bookings from today (Algiers).
create function private.demo_reset(p_salon_id text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_settings private.demo_settings;
  v_user     uuid;
begin
  -- the demo check, on the locked salon row (a nightly and an on-demand reset never interleave)
  perform 1 from public.salons s where s.id = p_salon_id and s.demo for update;
  if not found then
    raise exception 'not_demo' using errcode = 'P0001';
  end if;
  select * into v_settings from private.demo_settings d where d.salon_id = p_salon_id;
  if not found then
    raise exception 'not_demo' using errcode = 'P0001';
  end if;

  delete from private.bookings b where b.salon_id = p_salon_id;
  delete from public.stylist_days_off o where o.salon_id = p_salon_id;
  delete from public.salon_closed_dates c where c.salon_id = p_salon_id;
  delete from private.push_subscriptions ps
  where ps.salon_id = p_salon_id
    and ps.user_id in (select st.user_id from private.staff st where st.salon_id = p_salon_id and st.role = 'demo');

  -- links, working days and days off go with them (on delete cascade)
  delete from public.stylists st
  where st.salon_id = p_salon_id
    and not exists (select 1 from jsonb_array_elements(v_settings.snapshot -> 'stylists') x where x ->> 'id' = st.id);
  delete from public.services s
  where s.salon_id = p_salon_id
    and not exists (select 1 from jsonb_array_elements(v_settings.snapshot -> 'services') x where x ->> 'id' = s.id);

  perform public.provision_salon(
    (v_settings.snapshot - 'domains' - 'owner_user_id' - 'add_owner') || jsonb_build_object('id', p_salon_id));

  -- the public login, for each demo account of this salon; the account that still has the login
  -- email goes first, and the email is only restored where no other account holds it
  for v_user in
    select st.user_id from private.staff st join auth.users u on u.id = st.user_id
    where st.salon_id = p_salon_id and st.role = 'demo'
    order by lower(u.email) is not distinct from lower(v_settings.login_email) desc, u.last_sign_in_at desc nulls last, u.id
  loop
    update auth.users u set
      email = case when exists (select 1 from auth.users o
                                where o.id <> u.id and lower(o.email) = lower(v_settings.login_email))
                   then u.email else v_settings.login_email end,
      encrypted_password = extensions.crypt(v_settings.login_password, extensions.gen_salt('bf')),
      email_change = '',
      email_change_token_new = '',
      email_change_token_current = '',
      email_change_confirm_status = 0,
      email_change_sent_at = null,
      updated_at = now()
    where u.id = v_user;
    update auth.identities i set identity_data = i.identity_data || jsonb_build_object('email', u.email)
    from auth.users u
    where u.id = v_user and i.user_id = v_user and i.provider = 'email';
  end loop;

  perform private.demo_fake_bookings(p_salon_id, (now() at time zone 'Africa/Algiers')::date, 7);
end;
$$;

revoke execute on function private.demo_reset(text) from public, anon, authenticated;

-- Resets every demo salon (the nightly job). Not caught per salon: a failure shows as a failed run
-- in cron.job_run_details instead of passing silently.
create function private.demo_reset_all()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id text;
begin
  for v_id in select s.id from public.salons s where s.demo order by s.id loop
    perform private.demo_reset(v_id);
  end loop;
end;
$$;

revoke execute on function private.demo_reset_all() from public, anon, authenticated;

-- "Réinitialiser la démo": only the product owner's own account (role owner) in a demo salon.
create function public.admin_reset_demo()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if private.my_role() is distinct from 'owner'
     or not exists (select 1 from public.salons s where s.id = private.my_salon() and s.demo) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  perform private.demo_reset(private.my_salon());
end;
$$;

revoke execute on function public.admin_reset_demo() from public, anon, authenticated;
grant execute on function public.admin_reset_demo() to authenticated;

-- Nightly at ~03:00 Algiers (UTC+1 all year). Re-running the migration replaces the job.
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'demo-nightly-reset';
select cron.schedule('demo-nightly-reset', '0 2 * * *', 'select private.demo_reset_all()');
