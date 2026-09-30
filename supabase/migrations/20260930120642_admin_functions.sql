create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.staff s where s.user_id = auth.uid()) $$;

create or replace function public.admin_list_bookings(p_from date, p_to date)
returns table (
  id uuid, starts_at timestamptz, ends_at timestamptz, status text, price integer,
  client_name text, client_phone text, lang text, service_id text, service_name jsonb,
  stylist_id text, stylist_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  return query
    select b.id, b.starts_at, b.ends_at, b.status, b.price,
           b.client_name, b.client_phone, b.lang, b.service_id, s.name,
           b.stylist_id, st.name, b.created_at
    from private.bookings b
    join public.services s on s.id = b.service_id
    join public.stylists st on st.id = b.stylist_id
    where b.starts_at >= private.slot_start(p_from, time '00:00')
      and b.starts_at < private.slot_start(p_to + 1, time '00:00')
    order by b.starts_at;
end;
$$;

create or replace function public.admin_set_booking_status(p_id uuid, p_status text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_status is null or p_status not in ('confirmed', 'cancelled') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  update private.bookings b set status = p_status where b.id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
exception when exclusion_violation then
  raise exception 'slot_taken' using errcode = 'P0001';
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.admin_list_bookings(date, date) from public, anon, authenticated;
revoke execute on function public.admin_set_booking_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_bookings(date, date) to authenticated;
grant execute on function public.admin_set_booking_status(uuid, text) to authenticated;
