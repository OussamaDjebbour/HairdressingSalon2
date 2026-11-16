-- The owner manages a visit: remove one part, or move the whole visit to another time.

-- Same overlap rule, now deferrable: moving a visit can put a part on its own part's old slot
-- (Amina 10:00 coupe + 11:00 coloration moved to 10:30). Initially immediate, so every other
-- function behaves exactly as before; only admin_move_visit defers it, and only inside its update.
alter table private.bookings drop constraint bookings_no_overlap;
alter table private.bookings add constraint bookings_no_overlap exclude using gist
  (stylist_id with =, tstzrange(starts_at, ends_at) with &&)
  where (status <> 'cancelled')
  deferrable initially immediate;

-- Cancels one part and detaches it from its visit (a fresh visit_id), so confirming or cancelling
-- the visit later never touches it. The other parts keep their times and status.
create function public.admin_remove_visit_part(p_id uuid)
returns void
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
  v_visit uuid;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select b.visit_id into v_visit from private.bookings b
  where b.id = p_id and b.salon_id = v_salon and b.status <> 'cancelled';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- lock the whole visit so two removals at once can't cancel its last parts
  perform 1 from private.bookings b where b.salon_id = v_salon and b.visit_id = v_visit order by b.id for update;
  if not exists (
    select 1 from private.bookings b
    where b.id = p_id and b.salon_id = v_salon and b.visit_id = v_visit and b.status <> 'cancelled'
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from private.bookings b
    where b.salon_id = v_salon and b.visit_id = v_visit and b.id <> p_id and b.status <> 'cancelled'
  ) then
    raise exception 'last_part' using errcode = 'P0001';
  end if;
  update private.bookings b set status = 'cancelled', visit_id = gen_random_uuid()
  where b.id = p_id and b.salon_id = v_salon;
end;
$$;

-- Moves every non-cancelled part of a one-day visit by the same amount, so the first part starts at
-- p_date p_time (owner grid). p_stylists maps booking id -> stylist id (missing = keep). Prices,
-- lengths and statuses are kept; cancelled parts stay where they are.
create function public.admin_move_visit(p_id uuid, p_date date, p_time text, p_stylists jsonb)
returns void
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_salon    text := private.my_salon();
  v_visit    uuid;
  v_row      private.bookings%rowtype;
  v_parts    private.bookings[] := array[]::private.bookings[];
  v_ids      uuid[] := array[]::uuid[];
  v_stylists text[] := array[]::text[];
  v_starts   timestamptz[] := array[]::timestamptz[];
  v_ends     timestamptz[] := array[]::timestamptz[];
  v_stylist  text;
  v_n        integer;
  v_start    timestamptz;
  v_delta    interval;
  v_opens    integer;
  v_closes   integer;
  v_open_at  timestamptz;
  v_close_at timestamptz;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select b.visit_id into v_visit from private.bookings b where b.id = p_id and b.salon_id = v_salon;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  for v_row in
    select b.* from private.bookings b
    where b.salon_id = v_salon and b.visit_id = v_visit and b.status <> 'cancelled'
    order by b.starts_at, b.id
    for update
  loop
    v_parts := v_parts || v_row;
  end loop;
  v_n := coalesce(array_length(v_parts, 1), 0);

  if v_n < 2 or exists (select 1 from unnest(v_parts) p where p.status not in ('pending', 'confirmed')) then
    raise exception 'not_movable' using errcode = 'P0001';
  end if;
  if (select count(distinct (p.starts_at at time zone 'Africa/Algiers')::date) from unnest(v_parts) p) > 1 then
    raise exception 'visit_spans_days' using errcode = 'P0001';
  end if;

  for i in 1 .. v_n loop
    v_stylist := coalesce(p_stylists ->> v_parts[i].id::text, v_parts[i].stylist_id);
    if v_stylist is distinct from v_parts[i].stylist_id and not exists (
      select 1 from public.stylists st where st.id = v_stylist and st.salon_id = v_salon and st.active
    ) then
      raise exception 'unknown_service' using errcode = 'P0001';
    end if;
    v_ids := v_ids || v_parts[i].id;
    v_stylists := v_stylists || v_stylist;
  end loop;

  v_start := private.staff_slot(v_salon, p_date, p_time,
    (extract(epoch from v_parts[1].ends_at - v_parts[1].starts_at) / 60)::int);
  v_delta := v_start - v_parts[1].starts_at;
  select h.opens_min, h.closes_min into v_opens, v_closes from private.day_hours(v_salon, p_date) h;
  v_open_at := private.slot_start(p_date, time '00:00') + make_interval(mins => v_opens);
  v_close_at := private.slot_start(p_date, time '00:00') + make_interval(mins => v_closes);
  for i in 1 .. v_n loop
    v_starts := v_starts || (v_parts[i].starts_at + v_delta);
    v_ends := v_ends || (v_parts[i].ends_at + v_delta);
    if v_starts[i] < v_open_at or v_ends[i] > v_close_at then
      raise exception 'outside_hours' using errcode = 'P0001';
    end if;
  end loop;

  -- the first part (start order) that would overlap another booking, or an earlier part of this visit
  for i in 1 .. v_n loop
    if exists (
      select 1 from private.bookings b
      where b.salon_id = v_salon and b.stylist_id = v_stylists[i] and b.status <> 'cancelled'
        and b.id <> all (v_ids)
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(v_starts[i], v_ends[i])
    ) or exists (
      select 1 from generate_series(1, i - 1) j
      where v_stylists[j] = v_stylists[i] and tstzrange(v_starts[j], v_ends[j]) && tstzrange(v_starts[i], v_ends[i])
    ) then
      raise exception 'slot_taken' using errcode = 'P0001', detail = 'item:' || (i - 1);
    end if;
  end loop;

  -- parts may land on each other's old slots: check overlaps once every part has moved
  set constraints private.bookings_no_overlap deferred;
  for i in 1 .. v_n loop
    update private.bookings b
    set starts_at = v_starts[i], ends_at = v_ends[i], stylist_id = v_stylists[i]
    where b.id = v_ids[i] and b.salon_id = v_salon;
  end loop;
  -- checks now (a booking made meanwhile still raises here, mapped to slot_taken)
  set constraints private.bookings_no_overlap immediate;
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

revoke execute on function public.admin_remove_visit_part(uuid) from public, anon, authenticated;
revoke execute on function public.admin_move_visit(uuid, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_remove_visit_part(uuid) to authenticated;
grant execute on function public.admin_move_visit(uuid, date, text, jsonb) to authenticated;
