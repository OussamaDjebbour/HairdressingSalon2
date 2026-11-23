-- Statistiques for the owner: one call returns a period's totals, a comparison period's totals (the caller
-- chooses it: the same days of the previous week/month, or the previous calendar month), per coiffeuse, the most
-- booked services and the website's requests. Totals only — never a client's name or phone (so it also works for
-- the demo account, whose phones are masked). Scoped by my_salon(); a period is by visit day (Algiers time), at
-- most a year.
--
-- Counting: income, visits, clients and booked minutes use confirmed bookings (the price recorded on each
-- booking, promotions included); a visit of several parts counts once; pending visits are counted apart;
-- cancelled ones never. Capacity = each coiffeuse who is active or worked in the period × her working weekdays
-- minus her days off × that day's opening minutes — by her own schedule, not the active flag, so a coiffeuse
-- hidden since still counts for the period she worked. A "new" client is a phone with no earlier non-cancelled
-- booking at the salon. A website request is one booking request (same phone, same moment), whatever the owner
-- later did to its parts (a removed part is detached into its own visit but stays the same request).

-- One coiffeuse's capacity in minutes over [p_from, p_to].
create function private.stats_capacity(p_salon_id text, p_stylist_id text, p_from date, p_to date)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(h.closes_min - h.opens_min), 0)::int
  from generate_series(p_from, p_to, interval '1 day') d
  cross join lateral private.day_hours(p_salon_id, d::date) h
  where exists (
      select 1 from public.stylist_workdays w
      where w.salon_id = p_salon_id and w.stylist_id = p_stylist_id and w.weekday = extract(isodow from d))
    and not exists (
      select 1 from public.stylist_days_off o
      where o.salon_id = p_salon_id and o.stylist_id = p_stylist_id and d::date between o.starts_on and o.ends_on)
$$;
revoke execute on function private.stats_capacity(text, text, date, date) from public, anon, authenticated;

-- The totals of [p_from, p_to] for one salon.
create function private.stats_totals(p_salon_id text, p_from date, p_to date)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with b as (
    select bk.*
    from private.bookings bk
    where bk.salon_id = p_salon_id
      and (bk.starts_at at time zone 'Africa/Algiers')::date between p_from and p_to
  ),
  confirmed as (select * from b where status = 'confirmed')
  select jsonb_build_object(
    'revenue', coalesce((select sum(price) from confirmed), 0),
    'visits', (select count(distinct visit_id) from confirmed),
    'pending', (select count(distinct visit_id) from b where status = 'pending'),
    'booked_min', coalesce((select sum(extract(epoch from ends_at - starts_at) / 60) from confirmed), 0)::int,
    'capacity_min', coalesce((
      select sum(private.stats_capacity(p_salon_id, st.id, p_from, p_to))
      from public.stylists st
      where st.salon_id = p_salon_id
        and (st.active or exists (select 1 from confirmed c where c.stylist_id = st.id))), 0)::int,
    'clients', (select count(distinct client_phone) from confirmed),
    'new_clients', (
      select count(distinct c.client_phone) from confirmed c
      where not exists (
        select 1 from private.bookings o
        where o.salon_id = p_salon_id and o.client_phone = c.client_phone and o.status <> 'cancelled'
          and (o.starts_at at time zone 'Africa/Algiers')::date < p_from))
  )
$$;
revoke execute on function private.stats_totals(text, date, date) from public, anon, authenticated;

create function public.admin_stats(p_from date, p_to date, p_prev_from date, p_prev_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 365
     or p_prev_from is null or p_prev_to is null or p_prev_from > p_prev_to or p_prev_to - p_prev_from > 365 then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'current', private.stats_totals(v_salon, p_from, p_to),
    'previous', private.stats_totals(v_salon, p_prev_from, p_prev_to),
    -- every active coiffeuse (and any hidden one with confirmed bookings), the highest income first
    'stylists', coalesce((
      select jsonb_agg(x order by (x->>'revenue')::int desc, x->>'name')
      from (
        select jsonb_build_object(
          'id', st.id,
          'name', st.name,
          'visits', count(distinct bk.visit_id),
          'revenue', coalesce(sum(bk.price), 0),
          'booked_min', coalesce(sum(extract(epoch from bk.ends_at - bk.starts_at) / 60), 0)::int,
          'capacity_min', private.stats_capacity(v_salon, st.id, p_from, p_to)
        ) as x
        from public.stylists st
        left join private.bookings bk
          on bk.salon_id = st.salon_id and bk.stylist_id = st.id and bk.status = 'confirmed'
         and (bk.starts_at at time zone 'Africa/Algiers')::date between p_from and p_to
        where st.salon_id = v_salon
        group by st.id, st.name, st.active
        having st.active or count(bk.id) > 0
      ) per), '[]'::jsonb),
    -- the five most booked services (confirmed), ties broken by income
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', n, 'revenue', revenue) order by n desc, revenue desc, id)
      from (
        select sv.id, sv.name, count(*) as n, sum(bk.price) as revenue
        from private.bookings bk
        join public.services sv on sv.salon_id = bk.salon_id and sv.id = bk.service_id
        where bk.salon_id = v_salon and bk.status = 'confirmed'
          and (bk.starts_at at time zone 'Africa/Algiers')::date between p_from and p_to
        group by sv.id, sv.name
        order by count(*) desc, sum(bk.price) desc, sv.id
        limit 5
      ) top), '[]'::jsonb),
    -- website requests (one per phone and moment), by what became of them: any part confirmed → confirmed;
    -- else any part waiting → pending; else cancelled (refused by the salon or cancelled later)
    'online', (
      select jsonb_build_object(
        'requests', count(*),
        'confirmed', count(*) filter (where any_confirmed),
        'pending', count(*) filter (where not any_confirmed and any_pending),
        'cancelled', count(*) filter (where not any_confirmed and not any_pending))
      from (
        select bool_or(bk.status = 'confirmed') as any_confirmed, bool_or(bk.status = 'pending') as any_pending
        from private.bookings bk
        where bk.salon_id = v_salon and bk.source = 'online'
          and (bk.starts_at at time zone 'Africa/Algiers')::date between p_from and p_to
        group by bk.client_phone, bk.created_at
      ) req)
  );
end;
$$;
revoke execute on function public.admin_stats(date, date, date, date) from public, anon, authenticated;
grant execute on function public.admin_stats(date, date, date, date) to authenticated;
