-- Owner RPCs for the catalogue: services, stylists and stylist days off.
-- Security definer (the tables have no write policies); every read/write is filtered by private.my_salon().

create function public.admin_save_service(
  p_id text, p_name jsonb, p_description jsonb, p_category text,
  p_price integer, p_duration integer, p_sort_order integer)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
  v_id    text := p_id;
  v_name_fr text := btrim(coalesce(p_name ->> 'fr', ''));
  v_desc_fr text := btrim(coalesce(p_description ->> 'fr', ''));
  -- An empty Arabic text falls back to the French one.
  v_name  jsonb := jsonb_build_object('fr', v_name_fr,
                     'ar', coalesce(nullif(btrim(coalesce(p_name ->> 'ar', '')), ''), v_name_fr));
  v_desc  jsonb := case when p_description is not null then jsonb_build_object('fr', v_desc_fr,
                     'ar', coalesce(nullif(btrim(coalesce(p_description ->> 'ar', '')), ''), v_desc_fr)) end;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_name_fr) not between 2 and 80
     or p_category is null or p_category not in ('coiffure', 'beaute') then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if p_price is null or p_price not between 0 and 1000000 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;
  if p_duration is null or p_duration not between 15 and 600 or p_duration % 15 <> 0 then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;

  if p_id is null then
    v_id := gen_random_uuid()::text;
    insert into public.services (id, salon_id, category, name, description, price, duration, image, icon, sort_order)
    values (v_id, v_salon, p_category,
            v_name, coalesce(v_desc, '{"fr":"","ar":""}'::jsonb), p_price, p_duration, '',
            case p_category when 'beaute' then 'sparkles' else 'scissors' end,
            coalesce(p_sort_order, 0));
  else
    update public.services s
    set name = v_name,
        description = coalesce(v_desc, s.description),
        category = p_category, price = p_price, duration = p_duration,
        sort_order = coalesce(p_sort_order, s.sort_order)
    where s.id = p_id and s.salon_id = v_salon;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;

create function public.admin_set_service_active(p_id text, p_active boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_salon text := private.my_salon();
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.services s set active = coalesce(p_active, s.active) where s.id = p_id and s.salon_id = v_salon;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.admin_save_stylist(
  p_id text, p_name text, p_role jsonb, p_service_ids text[], p_weekdays smallint[])
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
  v_id    text := p_id;
  v_name  text := btrim(coalesce(p_name, ''));
  v_role_fr text := btrim(coalesce(p_role ->> 'fr', ''));
  -- An empty Arabic role falls back to the French one.
  v_role  jsonb := jsonb_build_object('fr', v_role_fr,
                     'ar', coalesce(nullif(btrim(coalesce(p_role ->> 'ar', '')), ''), v_role_fr));
  v_services text[] := coalesce(p_service_ids, '{}'::text[]);
  v_days  smallint[] := coalesce(p_weekdays, '{}'::smallint[]);
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_days) d where d is null or d not between 1 and 7) then
    raise exception 'invalid_weekday' using errcode = 'P0001';
  end if;
  if p_id is not null and not exists (select 1 from public.stylists st where st.id = p_id and st.salon_id = v_salon) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(v_services) sid
    where sid is null or not exists (select 1 from public.services s where s.id = sid and s.salon_id = v_salon)
  ) then
    raise exception 'unknown_service' using errcode = 'P0001';
  end if;

  if p_id is null then
    v_id := gen_random_uuid()::text;
    insert into public.stylists (id, salon_id, name, role, specialties, image)
    values (v_id, v_salon, v_name, v_role, '[]', '');
  else
    update public.stylists st set name = v_name, role = v_role where st.id = p_id and st.salon_id = v_salon;
  end if;

  delete from public.stylist_services ss where ss.stylist_id = v_id and ss.salon_id = v_salon;
  insert into public.stylist_services (salon_id, stylist_id, service_id)
  select distinct v_salon, v_id, sid from unnest(v_services) sid;

  delete from public.stylist_workdays w where w.stylist_id = v_id and w.salon_id = v_salon;
  insert into public.stylist_workdays (salon_id, stylist_id, weekday)
  select distinct v_salon, v_id, d from unnest(v_days) d;
  return v_id;
end;
$$;

create function public.admin_set_stylist_active(p_id text, p_active boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_salon text := private.my_salon();
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.stylists st set active = coalesce(p_active, st.active) where st.id = p_id and st.salon_id = v_salon;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.admin_add_stylist_days_off(p_stylist_id text, p_from date, p_to date)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
  v_id    uuid;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid_dates' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.stylists st where st.id = p_stylist_id and st.salon_id = v_salon) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.stylist_days_off (salon_id, stylist_id, starts_on, ends_on)
  values (v_salon, p_stylist_id, p_from, p_to) returning id into v_id;
  return v_id;
end;
$$;

create function public.admin_delete_stylist_days_off(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare v_salon text := private.my_salon();
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  delete from public.stylist_days_off d where d.id = p_id and d.salon_id = v_salon;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.admin_save_service(text, jsonb, jsonb, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_set_service_active(text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_save_stylist(text, text, jsonb, text[], smallint[]) from public, anon, authenticated;
revoke execute on function public.admin_set_stylist_active(text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_add_stylist_days_off(text, date, date) from public, anon, authenticated;
revoke execute on function public.admin_delete_stylist_days_off(uuid) from public, anon, authenticated;
grant execute on function public.admin_save_service(text, jsonb, jsonb, text, integer, integer, integer) to authenticated;
grant execute on function public.admin_set_service_active(text, boolean) to authenticated;
grant execute on function public.admin_save_stylist(text, text, jsonb, text[], smallint[]) to authenticated;
grant execute on function public.admin_set_stylist_active(text, boolean) to authenticated;
grant execute on function public.admin_add_stylist_days_off(text, date, date) to authenticated;
grant execute on function public.admin_delete_stylist_days_off(uuid) to authenticated;
