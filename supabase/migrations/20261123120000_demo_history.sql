-- The demo had no past: each reset deleted every booking and only filled the next 7 days, so the agenda's past days
-- and the owner's Statistiques (this month so far, last month…) were empty during a pitch. demo_reset now also fills
-- the last 90 days with the same generator, then makes those bookings look like history: confirmed (about one website
-- request in ten cancelled), none left waiting, each made 1–10 days before its date, and drawn from about 150 regular
-- clients (same name, same phone) so some come back, as in a real salon. Deterministic per salon and day,
-- like the week ahead; demo salons only (not_demo otherwise); no push (the generator's own guard).

create function private.demo_fake_history(p_salon_id text, p_days integer)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
  v_names text[] := array['Amel', 'Yasmine', 'Nesrine', 'Lina', 'Meriem', 'Imane', 'Khadidja', 'Rania',
                          'Feriel', 'Asma', 'Lamia', 'Soumia', 'Nour', 'Samira', 'Kenza', 'Ryma', 'Hiba',
                          'Selma', 'Wafa', 'Sabrina'];
  v_count integer;
begin
  v_count := private.demo_fake_bookings(p_salon_id, v_today - p_days, p_days);
  update private.bookings b set
    client_phone = '0550000' || lpad(c.n::text, 3, '0'), -- the reserved fake range
    client_name = v_names[1 + c.n % cardinality(v_names)],
    status = case
      when b.source = 'online' and private.demo_rand(b.stylist_id || ':' || b.starts_at || ':cancel', 10) = 0 then 'cancelled'
      else 'confirmed' end,
    created_at = b.starts_at - make_interval(hours => 24 + private.demo_rand(b.stylist_id || ':' || b.starts_at || ':made', 216))
  from (select bk.id, private.demo_rand(bk.stylist_id || ':' || bk.starts_at || ':client', 150) as n
        from private.bookings bk where bk.salon_id = p_salon_id) c
  where b.id = c.id and b.salon_id = p_salon_id
    and (b.starts_at at time zone 'Africa/Algiers')::date between v_today - p_days and v_today - 1;
  return v_count;
end;
$$;
revoke execute on function private.demo_fake_history(text, integer) from public, anon, authenticated;

-- demo_reset: latest body (20261122100000_service_categories.sql) + the history above.
create or replace function private.demo_reset(p_salon_id text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_settings private.demo_settings;
  v_snapshot jsonb;
  v_user     uuid;
  v_today    date := (now() at time zone 'Africa/Algiers')::date;
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

  -- the prospect's services and packs (their stylist links go with them: on delete cascade)
  delete from public.services s
  where s.salon_id = p_salon_id
    and not exists (select 1 from jsonb_array_elements(v_settings.snapshot -> 'services') x where x ->> 'id' = s.id);

  v_snapshot := (v_settings.snapshot - 'domains' - 'owner_user_id' - 'add_owner') || jsonb_build_object('id', p_salon_id);
  if jsonb_typeof(v_snapshot -> 'services') = 'array' then
    -- a snapshot promotion runs again from the reset day, for as many days (the pitch always shows it)
    v_snapshot := jsonb_set(v_snapshot, '{services}', coalesce((
      select jsonb_agg('{"promo_price": null, "promo_from": null, "promo_to": null}'::jsonb || x
                       || case when jsonb_typeof(x -> 'promo_from') = 'string' and jsonb_typeof(x -> 'promo_to') = 'string'
                               then jsonb_build_object('promo_from', v_today,
                                                       'promo_to', v_today + ((x ->> 'promo_to')::date - (x ->> 'promo_from')::date))
                               else '{}'::jsonb end
                       order by n)
      from jsonb_array_elements(v_snapshot -> 'services') with ordinality t(x, n)), '[]'));
  end if;
  perform public.provision_salon(v_snapshot);

  -- the prospect's categories (none of the salon's services uses them any more)
  delete from public.salon_categories c
  where c.salon_id = p_salon_id
    and not exists (select 1 from jsonb_array_elements(coalesce(v_settings.snapshot -> 'categories', '[]')) x
                    where x ->> 'id' = c.id);

  -- the prospect's stylists (links, working days and days off go with them: on delete cascade)
  delete from public.stylists st
  where st.salon_id = p_salon_id
    and not exists (select 1 from jsonb_array_elements(v_settings.snapshot -> 'stylists') x where x ->> 'id' = st.id);

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

  perform private.demo_fake_bookings(p_salon_id, v_today, 7);
  -- and a past, so the agenda's past days and the Statistiques have something to show
  perform private.demo_fake_history(p_salon_id, 90);
end;
$$;

revoke execute on function private.demo_reset(text) from public, anon, authenticated;
