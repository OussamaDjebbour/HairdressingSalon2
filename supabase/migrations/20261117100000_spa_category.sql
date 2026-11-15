-- Third service category: spa. Spa services book like any other (no own hours or section).
-- category_icon is the default icon of a category; only definer functions use it.

create function private.category_icon(p_category text)
returns text
language sql immutable
as $$
  select case p_category when 'coiffure' then 'scissors' when 'beaute' then 'sparkles' when 'spa' then 'flower' end
$$;
revoke execute on function private.category_icon(text) from public, anon, authenticated;

create or replace function public.admin_save_service(
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
     or p_category is null or p_category not in ('coiffure', 'beaute', 'spa') then
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
            private.category_icon(p_category),
            coalesce(p_sort_order, 0));
  else
    update public.services s
    set name = v_name,
        description = coalesce(v_desc, s.description),
        category = p_category, price = p_price, duration = p_duration,
        -- A category change moves the icon along only while it is still the old category's default.
        icon = case when s.category <> p_category and s.icon = private.category_icon(s.category)
                    then private.category_icon(p_category) else s.icon end,
        sort_order = coalesce(p_sort_order, s.sort_order)
    where s.id = p_id and s.salon_id = v_salon;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.provision_salon(p jsonb)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
-- Creates or updates a whole salon; idempotent (re-running a payload changes nothing).
-- Service role only. Raises (P0001): invalid_id, invalid_name, invalid_palette, invalid_domain,
-- invalid_hours, invalid_phone, invalid_url, invalid_service, invalid_stylist, unknown_service,
-- domain_taken, id_taken, staff_taken, owner_conflict.
--
-- Input (jsonb object):
-- {
--   "id": "sara",                       required, ^[a-z0-9][a-z0-9-]{1,39}$, never changes
--   "name": "Sara Beauty",              required, 2..80 chars
--   "name_ar": "سارة بيوتي",            null/"" -> the site uses "name"
--   "palette": {"50": "#RRGGBB", "100": …, "900": …},   exactly the 10 keys 50..900; upper-cased
--   "hero_image": "https://…",          "" = none
--   "founder_name": {"fr": "Sara", "ar": "سارة"},       ar optional
--   "founder_role": {"fr": "…", "ar": "…"},
--   "story": {"fr": "…", "ar": "…"},                     the quote
--   "story_intro": {"fr": "…", "ar": "…"},               the paragraph under it
--   "years_open": 3, "client_count": 400, "rating": 4.7, "review_count": 52,   integers > 0; rating 1..5
--   "address": {"fr": "…", "ar": "…"}, "city": {"fr": "…", "ar": "…"},        <= 200 chars (invalid_name)
--   "whatsapp": "0555123456",           Algerian mobile, spaces/+213 normalised; "" -> none (invalid_phone)
--   "instagram_url": "https://…", "facebook_url": "https://…",               "" -> none (invalid_url)
--   "domains": ["sara-salon.com", "www.sara-salon.com"],   normalised (lowercase, no www./port/trailing dot), de-duplicated
--   "hours": [{"weekday": 1, "opens": null, "closes": null},
--             {"weekday": 2, "opens": "09:00", "closes": "18:00"}, …],   required for a new salon: weekdays 1 (Mon)..7 (Sun)
--                                                                         once each; HH:MM in 15-minute steps, opens < closes
--   "services": [{"id": "sara-coupe", "category": "coiffure" | "beaute" | "spa",   required
--                 "name": {"fr", "ar"}, "price": 2000, "duration": 45,    required; DA; minutes, 15..600 in 15-minute steps
--                 "description": {"fr", "ar"}, "image": "https://…", "icon": "scissors",
--                 "sort_order": 0, "active": true}],
--   "stylists": [{"id": "sara-yasmine", "name": "Yasmine",                 required
--                 "role": {"fr", "ar"}, "specialties": [{"fr", "ar"}], "image": "https://…",
--                 "sort_order": 0, "active": true,
--                 "services": ["sara-coupe"],                            ids of this salon's services
--                 "weekdays": [2, 3, 4, 5, 6]}],
--   "owner_user_id": "uuid",            optional: an auth.users id made staff of this salon
--   "add_owner": true                   optional: allow owner_user_id to join an existing salon that
--                                       already has other staff (else owner_conflict: a salon id that
--                                       collides with another salon's must never take it over)
-- }
-- A key left out keeps the current value, so re-provisioning never undoes the owner's Réglages edits
-- for keys the payload omits. Defaults apply only when creating: salon columns take their column
-- defaults; a new service gets description "", image "", icon from its category, sort_order = list
-- position, active true; a new stylist gets role "", specialties [], image "", sort_order = list
-- position, active true, no services, and the salon's open weekdays.
-- A key given as null or "" clears the field. Bilingual texts: an empty "ar" falls back to "fr"; an
-- empty "fr" clears the field. "hours" replaces all 7 days; "domains" replaces the salon's domain
-- list; a stylist's "services"/"weekdays" replace its links/working days. Services and stylists are
-- upserted by id (ids are global: an id owned by another salon is id_taken); those not in the payload
-- are left untouched. Fields a payload lists overwrite the owner's edits.
declare
  v_id      text := p ->> 'id';
  v_name    text := btrim(coalesce(p ->> 'name', ''));
  v_new     boolean;
  v_new_st  boolean;
  v_palette jsonb;
  v_domains text[];
  v_owner   uuid;
  v_info    record;
  v_item    jsonb;
  v_pos     integer;
  v_sid     text;
  v_cat     text;
  v_svc_ids text[];
begin
  if p is null or jsonb_typeof(p) <> 'object' or coalesce(v_id, '') !~ '^[a-z0-9][a-z0-9-]{1,39}$' then
    raise exception 'invalid_id' using errcode = 'P0001';
  end if;
  if length(v_name) not between 2 and 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  v_new := not exists (select 1 from public.salons s where s.id = v_id);
  if v_new and not p ? 'hours' then
    raise exception 'invalid_hours' using errcode = 'P0001';
  end if;

  -- palette
  if p ? 'palette' then
    if jsonb_typeof(p -> 'palette') is distinct from 'object' then
      raise exception 'invalid_palette' using errcode = 'P0001';
    end if;
    if (select count(*) from jsonb_each(p -> 'palette')) <> 10
       or exists (select 1 from jsonb_each(p -> 'palette') e
                  where e.key <> all (array['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'])
                     or jsonb_typeof(e.value) <> 'string'
                     or (e.value #>> '{}') !~ '^#[0-9A-Fa-f]{6}$') then
      raise exception 'invalid_palette' using errcode = 'P0001';
    end if;
    select jsonb_object_agg(e.key, upper(e.value #>> '{}')) into v_palette from jsonb_each(p -> 'palette') e;
  end if;

  -- contact info: the owner's rules (keys left out are validated as empty and not written)
  select * into v_info from private.clean_salon_info(
    p -> 'address', p -> 'city', p ->> 'whatsapp', p ->> 'instagram_url', p ->> 'facebook_url');

  -- domains
  if p ? 'domains' then
    if jsonb_typeof(p -> 'domains') is distinct from 'array'
       or exists (select 1 from jsonb_array_elements(p -> 'domains') d where jsonb_typeof(d) <> 'string') then
      raise exception 'invalid_domain' using errcode = 'P0001';
    end if;
    v_domains := array(select distinct private.normalize_host(d) from jsonb_array_elements_text(p -> 'domains') d order by 1);
    if exists (select 1 from unnest(v_domains) d
               where d !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$' or length(d) > 253) then
      raise exception 'invalid_domain' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.salon_domains sd where sd.domain = any (v_domains) and sd.salon_id <> v_id) then
      raise exception 'domain_taken' using errcode = 'P0001';
    end if;
  end if;

  -- services and stylists: arrays of objects whose ids are not another salon's
  if (p ? 'services' and (jsonb_typeof(p -> 'services') <> 'array'
        or exists (select 1 from jsonb_array_elements(p -> 'services') x where jsonb_typeof(x) <> 'object'))) then
    raise exception 'invalid_service' using errcode = 'P0001';
  end if;
  if (p ? 'stylists' and (jsonb_typeof(p -> 'stylists') <> 'array'
        or exists (select 1 from jsonb_array_elements(p -> 'stylists') x where jsonb_typeof(x) <> 'object'))) then
    raise exception 'invalid_stylist' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p -> 'services', '[]')) x
             join public.services s on s.id = x ->> 'id' where s.salon_id <> v_id)
     or exists (select 1 from jsonb_array_elements(coalesce(p -> 'stylists', '[]')) x
                join public.stylists st on st.id = x ->> 'id' where st.salon_id <> v_id) then
    raise exception 'id_taken' using errcode = 'P0001';
  end if;

  -- owner
  if nullif(p ->> 'owner_user_id', '') is not null then
    v_owner := (p ->> 'owner_user_id')::uuid;
    if exists (select 1 from private.staff s where s.user_id = v_owner and s.salon_id <> v_id) then
      raise exception 'staff_taken' using errcode = 'P0001';
    end if;
    if not v_new
       and not exists (select 1 from private.staff s where s.user_id = v_owner and s.salon_id = v_id)
       and exists (select 1 from private.staff s where s.salon_id = v_id and s.user_id <> v_owner)
       and (p -> 'add_owner') is distinct from 'true'::jsonb then
      raise exception 'owner_conflict' using errcode = 'P0001';
    end if;
  end if;

  -- salon row: a key left out keeps the current value
  insert into public.salons (id, name) values (v_id, v_name) on conflict (id) do nothing;
  update public.salons s set
    name          = v_name,
    name_ar       = case when p ? 'name_ar' then nullif(btrim(coalesce(p ->> 'name_ar', '')), '') else s.name_ar end,
    palette       = coalesce(v_palette, s.palette),
    hero_image    = case when p ? 'hero_image' then btrim(coalesce(p ->> 'hero_image', '')) else s.hero_image end,
    founder_name  = case when p ? 'founder_name' then private.bilingual(p -> 'founder_name') else s.founder_name end,
    founder_role  = case when p ? 'founder_role' then private.bilingual(p -> 'founder_role') else s.founder_role end,
    story         = case when p ? 'story' then private.bilingual(p -> 'story') else s.story end,
    story_intro   = case when p ? 'story_intro' then private.bilingual(p -> 'story_intro') else s.story_intro end,
    years_open    = case when p ? 'years_open' then (p ->> 'years_open')::integer else s.years_open end,
    client_count  = case when p ? 'client_count' then (p ->> 'client_count')::integer else s.client_count end,
    rating        = case when p ? 'rating' then (p ->> 'rating')::numeric(2,1) else s.rating end,
    review_count  = case when p ? 'review_count' then (p ->> 'review_count')::integer else s.review_count end,
    address       = case when p ? 'address' then v_info.address else s.address end,
    city          = case when p ? 'city' then v_info.city else s.city end,
    whatsapp      = case when p ? 'whatsapp' then v_info.whatsapp else s.whatsapp end,
    instagram_url = case when p ? 'instagram_url' then v_info.instagram_url else s.instagram_url end,
    facebook_url  = case when p ? 'facebook_url' then v_info.facebook_url else s.facebook_url end
  where s.id = v_id;

  if v_domains is not null then
    delete from public.salon_domains sd where sd.salon_id = v_id and sd.domain <> all (v_domains);
    -- a plain insert: a domain another salon took since the domain_taken check fails loudly
    insert into public.salon_domains (domain, salon_id)
    select d, v_id from unnest(v_domains) d
    where not exists (select 1 from public.salon_domains sd where sd.domain = d and sd.salon_id = v_id);
  end if;

  if p ? 'hours' then
    perform private.set_hours(v_id, p -> 'hours');
  end if;

  for v_item, v_pos in select x, (n - 1)::int from jsonb_array_elements(coalesce(p -> 'services', '[]')) with ordinality t(x, n) loop
    v_sid := v_item ->> 'id';
    v_cat := v_item ->> 'category';
    if coalesce(v_sid, '') !~ '^[a-z0-9][a-z0-9-]{1,59}$' or v_cat is null or v_cat not in ('coiffure', 'beaute', 'spa')
       or length(coalesce(private.bilingual(v_item -> 'name') ->> 'fr', '')) not between 2 and 80
       or coalesce(v_item ->> 'price', '') !~ '^[0-9]{1,7}$' or (v_item ->> 'price')::integer > 1000000
       or coalesce(v_item ->> 'duration', '') !~ '^[0-9]{2,3}$'
       or (v_item ->> 'duration')::integer not between 15 and 600 or (v_item ->> 'duration')::integer % 15 <> 0 then
      raise exception 'invalid_service' using errcode = 'P0001';
    end if;
    insert into public.services as s (id, salon_id, category, name, description, price, duration, image, icon, sort_order, active)
    values (v_sid, v_id, v_cat, private.bilingual(v_item -> 'name'),
            coalesce(private.bilingual(v_item -> 'description'), '{"fr":"","ar":""}'),
            (v_item ->> 'price')::integer, (v_item ->> 'duration')::integer,
            btrim(coalesce(v_item ->> 'image', '')),
            coalesce(nullif(btrim(coalesce(v_item ->> 'icon', '')), ''), private.category_icon(v_cat)),
            coalesce((v_item ->> 'sort_order')::integer, v_pos),
            coalesce((v_item ->> 'active')::boolean, true))
    on conflict (id) do update set
      category    = excluded.category,
      name        = excluded.name,
      price       = excluded.price,
      duration    = excluded.duration,
      description = case when v_item ? 'description' then excluded.description else s.description end,
      image       = case when v_item ? 'image' then excluded.image else s.image end,
      icon        = case when v_item ? 'icon' then excluded.icon else s.icon end,
      sort_order  = case when v_item ? 'sort_order' then excluded.sort_order else s.sort_order end,
      active      = case when v_item ? 'active' then excluded.active else s.active end
    where s.salon_id = excluded.salon_id;
  end loop;

  for v_item, v_pos in select x, (n - 1)::int from jsonb_array_elements(coalesce(p -> 'stylists', '[]')) with ordinality t(x, n) loop
    v_sid := v_item ->> 'id';
    if coalesce(v_sid, '') !~ '^[a-z0-9][a-z0-9-]{1,59}$'
       or length(btrim(coalesce(v_item ->> 'name', ''))) not between 1 and 80
       or (v_item ? 'specialties' and jsonb_typeof(v_item -> 'specialties') <> 'array')
       or (v_item ? 'services' and jsonb_typeof(v_item -> 'services') <> 'array')
       or (v_item ? 'weekdays' and (jsonb_typeof(v_item -> 'weekdays') <> 'array'
           or exists (select 1 from jsonb_array_elements(v_item -> 'weekdays') w where w::text !~ '^[1-7]$'))) then
      raise exception 'invalid_stylist' using errcode = 'P0001';
    end if;
    v_svc_ids := array(select distinct s from jsonb_array_elements_text(coalesce(v_item -> 'services', '[]')) s);
    if exists (select 1 from unnest(v_svc_ids) s
               where not exists (select 1 from public.services x where x.id = s and x.salon_id = v_id)) then
      raise exception 'unknown_service' using errcode = 'P0001';
    end if;
    v_new_st := not exists (select 1 from public.stylists st where st.id = v_sid);

    insert into public.stylists as st (id, salon_id, name, role, specialties, image, sort_order, active)
    values (v_sid, v_id, btrim(v_item ->> 'name'),
            coalesce(private.bilingual(v_item -> 'role'), '{"fr":"","ar":""}'),
            coalesce(v_item -> 'specialties', '[]'),
            btrim(coalesce(v_item ->> 'image', '')),
            coalesce((v_item ->> 'sort_order')::integer, v_pos),
            coalesce((v_item ->> 'active')::boolean, true))
    on conflict (id) do update set
      name        = excluded.name,
      role        = case when v_item ? 'role' then excluded.role else st.role end,
      specialties = case when v_item ? 'specialties' then excluded.specialties else st.specialties end,
      image       = case when v_item ? 'image' then excluded.image else st.image end,
      sort_order  = case when v_item ? 'sort_order' then excluded.sort_order else st.sort_order end,
      active      = case when v_item ? 'active' then excluded.active else st.active end
    where st.salon_id = excluded.salon_id;

    if v_item ? 'services' then
      delete from public.stylist_services ss where ss.stylist_id = v_sid and ss.salon_id = v_id;
      insert into public.stylist_services (salon_id, stylist_id, service_id) select v_id, v_sid, s from unnest(v_svc_ids) s;
    end if;
    if v_item ? 'weekdays' then
      delete from public.stylist_workdays w where w.stylist_id = v_sid and w.salon_id = v_id;
      insert into public.stylist_workdays (salon_id, stylist_id, weekday)
      select distinct v_id, v_sid, w::text::smallint from jsonb_array_elements(v_item -> 'weekdays') w;
    elsif v_new_st then
      insert into public.stylist_workdays (salon_id, stylist_id, weekday)
      select v_id, v_sid, h.weekday from public.salon_hours h where h.salon_id = v_id and h.opens is not null;
    end if;
  end loop;

  if v_owner is not null then
    insert into private.staff (user_id, salon_id) values (v_owner, v_id) on conflict (user_id) do nothing;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.admin_save_service(text, jsonb, jsonb, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_save_service(text, jsonb, jsonb, text, integer, integer, integer) to authenticated;
revoke execute on function public.provision_salon(jsonb) from public, anon, authenticated;
grant execute on function public.provision_salon(jsonb) to service_role;
