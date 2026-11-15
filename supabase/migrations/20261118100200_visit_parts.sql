-- The owner's sheet shows a whole visit, even when some parts fall outside the week loaded.
-- Same columns, scoping and demo masking as admin_list_bookings; another salon's id gives no rows.
create function public.admin_visit_parts(p_booking_id uuid)
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
      and b.visit_id = (select o.visit_id from private.bookings o where o.id = p_booking_id and o.salon_id = v_salon)
    order by b.starts_at;
end;
$$;

revoke execute on function public.admin_visit_parts(uuid) from public, anon, authenticated;
grant execute on function public.admin_visit_parts(uuid) to authenticated;
