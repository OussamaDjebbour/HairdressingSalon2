-- The owner acts on a whole visit: confirm/cancel applies to every part, and the list says which parts belong together.

drop function public.admin_list_bookings(date, date);
create function public.admin_list_bookings(p_from date, p_to date)
returns table (
  id uuid, starts_at timestamptz, ends_at timestamptz, status text, price integer,
  client_name text, client_phone text, lang text, service_id text, service_name jsonb,
  stylist_id text, stylist_name text, created_at timestamptz, source text, visit_id uuid)
language plpgsql stable security invoker set search_path = ''
as $$
#variable_conflict use_column
declare
  v_salon text := private.my_salon();
  v_mask  boolean := private.my_role() = 'demo';
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  return query
    select b.id, b.starts_at, b.ends_at, b.status, b.price,
           b.client_name,
           case when v_mask then private.mask_phone(b.client_phone) else b.client_phone end,
           b.lang, b.service_id, s.name,
           b.stylist_id, st.name, b.created_at, b.source, b.visit_id
    from private.bookings b
    join public.services s on s.id = b.service_id
    join public.stylists st on st.id = b.stylist_id
    where b.salon_id = v_salon
      and b.starts_at >= private.slot_start(p_from, time '00:00')
      and b.starts_at < private.slot_start(p_to + 1, time '00:00')
    order by b.starts_at;
end;
$$;

create or replace function public.admin_set_booking_status(p_id uuid, p_status text)
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
  if p_status is null or p_status not in ('confirmed', 'cancelled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  select b.visit_id into v_visit from private.bookings b where b.id = p_id and b.salon_id = v_salon;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- one statement: an overlap on any part rolls the whole visit back
  update private.bookings b set status = p_status where b.salon_id = v_salon and b.visit_id = v_visit;
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

revoke execute on function public.admin_list_bookings(date, date) from public, anon, authenticated;
revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_bookings(date, date) to authenticated;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;
