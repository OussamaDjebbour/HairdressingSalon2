-- Subscription due dates. Salons pay by hand (BaridiMob, CCP, cash): the money never goes through the app,
-- which only knows the last day each salon has paid for and pauses ONLINE booking a few days after it.
--
-- Days past due D = Algiers today - paid_until:
--   D <= -6  ok       nothing shown
--   -5..0    soon     quiet notice in the owner's /admin
--   1..3     grace    warning in /admin; clients book as usual
--   D >= 4   paused   new online bookings refused (booking_paused); the site, the owner's agenda and every
--                    existing booking keep working
-- A salon with no row is not billed (never paused): the demo and every salon until the product owner gives it
-- a date with `pnpm salon-paid`. A demo salon is never paused, row or not. The state is private: visitors only
-- learn "booking open: yes / no" (salon_booking_open), staff see their own salon's state (admin_billing).

create table private.salon_billing (
  salon_id   text primary key references public.salons (id) on delete cascade,
  paid_until date not null,
  updated_at timestamptz not null default now()
);
alter table private.salon_billing enable row level security;
revoke all on private.salon_billing from public, anon, authenticated;

-- The one place the timeline is written.
create function private.billing_status(p_salon_id text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'state', case
        when d <= -6 then 'ok'
        when d <= 0 then 'soon'
        when d <= 3 then 'grace'
        else 'paused' end,
      'paid_until', b.paid_until,
      'paused_from', b.paid_until + 4)
    from private.salon_billing b
    join public.salons s on s.id = b.salon_id and not s.demo
    cross join lateral (select (now() at time zone 'Africa/Algiers')::date - b.paid_until as d) x
    where b.salon_id = p_salon_id), '{"state": "none"}'::jsonb)
$$;
revoke execute on function private.billing_status(text) from public, anon, authenticated;

create function private.booking_paused(p_salon_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.billing_status(p_salon_id) ->> 'state' = 'paused' $$;
revoke execute on function private.booking_paused(text) from public, anon, authenticated;

-- Every online booking path (create_visit, create_booking, any later one) inserts here: refuse while paused.
-- create_visit is all-or-nothing, so a refused part rolls the whole visit back. Owner bookings (source
-- 'staff') are never refused.
create function private.refuse_paused_booking()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.booking_paused(new.salon_id) then
    raise exception 'booking_paused' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.refuse_paused_booking() from public, anon, authenticated;

create trigger bookings_paused_guard
  before insert on private.bookings
  for each row when (new.source = 'online')
  execute function private.refuse_paused_booking();

-- The slot functions refuse too, so a page left open learns about the pause as soon as it asks for times.
-- Their bodies move unchanged to private.*_unchecked; the public names become thin checking wrappers.
-- A later migration that changes the slot rules must replace the private function, not the public one.
alter function public.get_visit_slots(text, date, jsonb) rename to get_visit_slots_unchecked;
alter function public.get_visit_slots_unchecked(text, date, jsonb) set schema private;
revoke execute on function private.get_visit_slots_unchecked(text, date, jsonb) from public, anon, authenticated;

create function public.get_visit_slots(p_salon_id text, p_date date, p_items jsonb)
returns table (slot text, available boolean, missing integer[])
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.booking_paused(p_salon_id) then
    raise exception 'booking_paused' using errcode = 'P0001';
  end if;
  return query select * from private.get_visit_slots_unchecked(p_salon_id, p_date, p_items);
end;
$$;
revoke execute on function public.get_visit_slots(text, date, jsonb) from public, anon, authenticated;
grant execute on function public.get_visit_slots(text, date, jsonb) to anon, authenticated;

alter function public.get_slots(text, date, text, text) rename to get_slots_unchecked;
alter function public.get_slots_unchecked(text, date, text, text) set schema private;
revoke execute on function private.get_slots_unchecked(text, date, text, text) from public, anon, authenticated;

create function public.get_slots(p_salon_id text, p_date date, p_service_id text, p_stylist_id text default null)
returns table (slot text, available boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.booking_paused(p_salon_id) then
    raise exception 'booking_paused' using errcode = 'P0001';
  end if;
  return query select * from private.get_slots_unchecked(p_salon_id, p_date, p_service_id, p_stylist_id);
end;
$$;
revoke execute on function public.get_slots(text, date, text, text) from public, anon, authenticated;
grant execute on function public.get_slots(text, date, text, text) to anon, authenticated;

-- The client page: is online booking open? Says nothing more than the page itself shows.
create function public.salon_booking_open(p_salon_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$ select not private.booking_paused(p_salon_id) $$;
revoke execute on function public.salon_booking_open(text) from public, anon, authenticated;
grant execute on function public.salon_booking_open(text) to anon, authenticated;

-- The owner's notice: her own salon's state, computed here so the browser's clock never decides.
create function public.admin_billing()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return private.billing_status(v_salon);
end;
$$;
revoke execute on function public.admin_billing() from public, anon, authenticated;
grant execute on function public.admin_billing() to authenticated;

-- The product owner's script (pnpm salon-paid), service role only.
create function public.billing_list()
returns table (salon_id text, name text, demo boolean, paid_until date, state text, paused_from date)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.demo, b.paid_until, st ->> 'state', (st ->> 'paused_from')::date
  from public.salons s
  left join private.salon_billing b on b.salon_id = s.id
  cross join lateral (select private.billing_status(s.id) as st) x
  order by s.id
$$;
revoke execute on function public.billing_list() from public, anon, authenticated;
grant execute on function public.billing_list() to service_role;

-- Sets the last paid day (null: back to not billed). Returns the new state.
create function public.billing_set(p_salon_id text, p_until date)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_demo boolean;
begin
  select s.demo into v_demo from public.salons s where s.id = p_salon_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_demo then
    raise exception 'demo_salon' using errcode = 'P0001';
  end if;
  if p_until is null then
    delete from private.salon_billing where salon_id = p_salon_id;
  else
    insert into private.salon_billing (salon_id, paid_until) values (p_salon_id, p_until)
    on conflict (salon_id) do update set paid_until = excluded.paid_until, updated_at = now();
  end if;
  return private.billing_status(p_salon_id);
end;
$$;
revoke execute on function public.billing_set(text, date) from public, anon, authenticated;
grant execute on function public.billing_set(text, date) to service_role;
