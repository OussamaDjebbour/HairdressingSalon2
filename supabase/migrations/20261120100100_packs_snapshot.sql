-- Packs and promotions survive provisioning and the demo reset.
-- - private.salon_snapshot carries each service's pack fields (includes, pack_stylist_id) and promotion
--   (promo_price, promo_from, promo_to); a stylist's "services" leave packs out (a pack's person is its
--   pack_stylist_id).
-- - provision_salon accepts them (private.provision_service, the owner function's rules), writes packs
--   after stylists so a pack's person can come in the same payload, and keeps what a payload doesn't
--   mention: a service listed without pack/promo keys keeps the current ones, and a stylist's "services"
--   never drop her pack rows. So re-running the launch script (whose files never list packs or
--   promotions) keeps the owner's packs and promotions.
-- - demo_reset deletes the prospect's services (packs) before re-applying the snapshot and the prospect's
--   stylists after it (a pack's person is a foreign key), and restores every snapshot service's promotion
--   (none when the snapshot has no promo keys: it was taken before promotions existed).

-- 1. The snapshot. Latest body: 20261115100000_demo.sql.
create or replace function private.salon_snapshot(p_salon_id text)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'address', s.address,
    'city', s.city,
    'whatsapp', s.whatsapp,
    'instagram_url', s.instagram_url,
    'facebook_url', s.facebook_url,
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', h.weekday,
                                          'opens', to_char(h.opens, 'HH24:MI'),
                                          'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday)
      from public.salon_hours h where h.salon_id = s.id), '[]'),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'category', x.category, 'name', x.name, 'description', x.description,
               'price', x.price, 'duration', x.duration, 'image', x.image, 'icon', x.icon,
               'sort_order', x.sort_order, 'active', x.active,
               'includes', to_jsonb(x.includes), 'pack_stylist_id', x.pack_stylist_id,
               'promo_price', x.promo_price, 'promo_from', x.promo_from, 'promo_to', x.promo_to)
             order by x.sort_order, x.id)
      from public.services x where x.salon_id = s.id), '[]'),
    'stylists', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', st.id, 'name', st.name, 'role', st.role, 'specialties', st.specialties,
               'image', st.image, 'sort_order', st.sort_order, 'active', st.active,
               'services', coalesce((select jsonb_agg(ss.service_id order by ss.service_id)
                                     from public.stylist_services ss
                                     join public.services x on x.salon_id = ss.salon_id and x.id = ss.service_id
                                     where ss.salon_id = s.id and ss.stylist_id = st.id and x.category <> 'pack'), '[]'),
               'weekdays', coalesce((select jsonb_agg(w.weekday order by w.weekday)
                                     from public.stylist_workdays w
                                     where w.salon_id = s.id and w.stylist_id = st.id), '[]'))
             order by st.sort_order, st.id)
      from public.stylists st where st.salon_id = s.id), '[]'))
  from public.salons s
  where s.id = p_salon_id
$$;

revoke execute on function private.salon_snapshot(text) from public, anon, authenticated;

-- 2. One service of a provision_salon payload (p_pos: its list position, the default sort_order), upserted
-- into p_salon_id (whose id the caller checked is not another salon's). Raises (P0001):
--   invalid_service: id, category (coiffure, beaute, spa, pack), name, price or duration;
--   invalid_pack: the owner function's pack rules — a pack's person (pack_stylist_id, required for a new
--     pack) is a stylist of this salon (hidden or not: a snapshot can hold a pack whose person was hidden
--     later), its "includes" is a list of this salon's non-pack services (duplicates dropped, order kept);
--     a regular service has no person and no included services; a service can't become a pack or stop
--     being one;
--   invalid_promo: promo_price/promo_from/promo_to all or none, 0 <= promo < price, YYYY-MM-DD days,
--     from <= to; and a payload price at or under a kept promotion (it would no longer be one).
-- Keys left out keep the current value: a service listed without "includes"/"pack_stylist_id" keeps its
-- pack fields, one without any promo key keeps its promotion; any promo key given replaces the promotion
-- (all three null clears it). A pack's person becomes its only stylist_services row.
create function private.provision_service(p_salon_id text, p_item jsonb, p_pos integer)
returns void
language plpgsql volatile set search_path = ''
as $$
declare
  v_sid      text := p_item ->> 'id';
  v_cat      text := p_item ->> 'category';
  v_pack     boolean := (p_item ->> 'category') = 'pack';
  v_old      public.services;
  v_price    integer;
  v_includes text[] := '{}'::text[];
  v_stylist  text;
  v_promo    integer;
  v_from     date;
  v_to       date;
begin
  if coalesce(v_sid, '') !~ '^[a-z0-9][a-z0-9-]{1,59}$' or v_cat is null or v_cat not in ('coiffure', 'beaute', 'spa', 'pack')
     or length(coalesce(private.bilingual(p_item -> 'name') ->> 'fr', '')) not between 2 and 80
     or coalesce(p_item ->> 'price', '') !~ '^[0-9]{1,7}$' or (p_item ->> 'price')::integer > 1000000
     or coalesce(p_item ->> 'duration', '') !~ '^[0-9]{2,3}$'
     or (p_item ->> 'duration')::integer not between 15 and 600 or (p_item ->> 'duration')::integer % 15 <> 0 then
    raise exception 'invalid_service' using errcode = 'P0001';
  end if;
  v_price := (p_item ->> 'price')::integer;
  select * into v_old from public.services s where s.id = v_sid and s.salon_id = p_salon_id;

  -- pack fields
  if v_old.id is not null and (v_old.category = 'pack') <> v_pack then
    raise exception 'invalid_pack' using errcode = 'P0001';
  end if;
  if v_pack then
    v_stylist := case when p_item ? 'pack_stylist_id' then p_item ->> 'pack_stylist_id' else v_old.pack_stylist_id end;
    if not exists (select 1 from public.stylists st where st.id = v_stylist and st.salon_id = p_salon_id) then
      raise exception 'invalid_pack' using errcode = 'P0001';
    end if;
    if p_item ? 'includes' then
      if jsonb_typeof(p_item -> 'includes') is distinct from 'array'
         or exists (select 1 from jsonb_array_elements(p_item -> 'includes') i
                    where jsonb_typeof(i) <> 'string'
                       or not exists (select 1 from public.services s
                                      where s.id = i #>> '{}' and s.salon_id = p_salon_id and s.category <> 'pack')) then
        raise exception 'invalid_pack' using errcode = 'P0001';
      end if;
      v_includes := array(select u.sid from jsonb_array_elements_text(p_item -> 'includes') with ordinality u(sid, n)
                          group by u.sid order by min(u.n));
    else
      v_includes := coalesce(v_old.includes, '{}'::text[]);
    end if;
  elsif nullif(p_item ->> 'pack_stylist_id', '') is not null
        or coalesce(p_item -> 'includes', '[]'::jsonb) not in ('[]'::jsonb, 'null'::jsonb) then
    raise exception 'invalid_pack' using errcode = 'P0001';
  end if;

  -- promotion
  if p_item ?| array['promo_price', 'promo_from', 'promo_to'] then
    if coalesce(p_item ->> 'promo_price', '0') !~ '^[0-9]{1,7}$'
       or coalesce(p_item ->> 'promo_from', '2000-01-01') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or coalesce(p_item ->> 'promo_to', '2000-01-01') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'invalid_promo' using errcode = 'P0001';
    end if;
    begin
      v_promo := (p_item ->> 'promo_price')::integer;
      v_from := (p_item ->> 'promo_from')::date;
      v_to := (p_item ->> 'promo_to')::date;
    exception when others then
      raise exception 'invalid_promo' using errcode = 'P0001';
    end;
    if num_nonnulls(v_promo, v_from, v_to) not in (0, 3) or v_from > v_to then
      raise exception 'invalid_promo' using errcode = 'P0001';
    end if;
  else
    v_promo := v_old.promo_price;
    v_from := v_old.promo_from;
    v_to := v_old.promo_to;
  end if;
  if v_promo >= v_price then
    raise exception 'invalid_promo' using errcode = 'P0001', detail = v_sid;
  end if;

  insert into public.services as s (id, salon_id, category, name, description, price, duration, image, icon, sort_order, active,
                                    includes, pack_stylist_id, promo_price, promo_from, promo_to)
  values (v_sid, p_salon_id, v_cat, private.bilingual(p_item -> 'name'),
          coalesce(private.bilingual(p_item -> 'description'), '{"fr":"","ar":""}'),
          v_price, (p_item ->> 'duration')::integer,
          btrim(coalesce(p_item ->> 'image', '')),
          coalesce(nullif(btrim(coalesce(p_item ->> 'icon', '')), ''), private.category_icon(v_cat)),
          coalesce((p_item ->> 'sort_order')::integer, p_pos),
          coalesce((p_item ->> 'active')::boolean, true),
          v_includes, v_stylist, v_promo, v_from, v_to)
  on conflict (id) do update set
    category        = excluded.category,
    name            = excluded.name,
    price           = excluded.price,
    duration        = excluded.duration,
    description     = case when p_item ? 'description' then excluded.description else s.description end,
    image           = case when p_item ? 'image' then excluded.image else s.image end,
    icon            = case when p_item ? 'icon' then excluded.icon else s.icon end,
    sort_order      = case when p_item ? 'sort_order' then excluded.sort_order else s.sort_order end,
    active          = case when p_item ? 'active' then excluded.active else s.active end,
    includes        = excluded.includes,
    pack_stylist_id = excluded.pack_stylist_id,
    promo_price     = excluded.promo_price,
    promo_from      = excluded.promo_from,
    promo_to        = excluded.promo_to
  where s.salon_id = excluded.salon_id;

  if v_pack then
    delete from public.stylist_services ss where ss.salon_id = p_salon_id and ss.service_id = v_sid;
    insert into public.stylist_services (salon_id, stylist_id, service_id) values (p_salon_id, v_stylist, v_sid);
  end if;
end;
$$;

revoke execute on function private.provision_service(text, jsonb, integer) from public, anon, authenticated;

-- 3. provision_salon. Latest body: 20261117100000_spa_category.sql; services go through
-- private.provision_service (regular ones before the stylists, packs after them), and a stylist's
-- "services" skip packs and never delete her pack rows.
create or replace function public.provision_salon(p jsonb)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
-- Creates or updates a whole salon; idempotent (re-running a payload changes nothing).
-- Service role only. Raises (P0001): invalid_id, invalid_name, invalid_palette, invalid_domain,
-- invalid_hours, invalid_phone, invalid_url, invalid_service, invalid_pack, invalid_promo,
-- invalid_stylist, unknown_service, domain_taken, id_taken, staff_taken, owner_conflict.
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
--   "services": [{"id": "sara-coupe", "category": "coiffure" | "beaute" | "spa" | "pack",   required
--                 "name": {"fr", "ar"}, "price": 2000, "duration": 45,    required; DA; minutes, 15..600 in 15-minute steps
--                 "description": {"fr", "ar"}, "image": "https://…", "icon": "scissors",
--                 "sort_order": 0, "active": true,
--                 "includes": ["sara-coupe"], "pack_stylist_id": "sara-yasmine",   a pack's services and person
--                 "promo_price": 1500, "promo_from": "2026-12-01", "promo_to": "2026-12-31"}],
--                 (pack and promo rules: private.provision_service)
--   "stylists": [{"id": "sara-yasmine", "name": "Yasmine",                 required
--                 "role": {"fr", "ar"}, "specialties": [{"fr", "ar"}], "image": "https://…",
--                 "sort_order": 0, "active": true,
--                 "services": ["sara-coupe"],                            ids of this salon's services (packs ignored)
--                 "weekdays": [2, 3, 4, 5, 6]}],
--   "owner_user_id": "uuid",            optional: an auth.users id made staff of this salon
--   "add_owner": true                   optional: allow owner_user_id to join an existing salon that
--                                       already has other staff (else owner_conflict: a salon id that
--                                       collides with another salon's must never take it over)
-- }
-- A key left out keeps the current value, so re-provisioning never undoes the owner's Réglages edits
-- for keys the payload omits. Defaults apply only when creating: salon columns take their column
-- defaults; a new service gets description "", image "", icon from its category, sort_order = list
-- position, active true, no promotion; a new stylist gets role "", specialties [], image "", sort_order =
-- list position, active true, no services, and the salon's open weekdays.
-- A key given as null or "" clears the field. Bilingual texts: an empty "ar" falls back to "fr"; an
-- empty "fr" clears the field. "hours" replaces all 7 days; "domains" replaces the salon's domain
-- list; a stylist's "services"/"weekdays" replace its links/working days (her pack rows are kept: a
-- pack's person is its "pack_stylist_id"). Services and stylists are upserted by id (ids are global: an
-- id owned by another salon is id_taken); those not in the payload are left untouched, so packs (made in
-- Réglages, never in a launch file) survive. A service listed without promo keys keeps its promotion.
-- Regular services are written first, then stylists, then packs (a pack's person and services can come
-- in the same payload). Fields a payload lists overwrite the owner's edits.
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
  v_svc_ids text[];
  v_packs   text[];
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

  -- regular services (packs after the stylists)
  for v_item, v_pos in select x, (n - 1)::int from jsonb_array_elements(coalesce(p -> 'services', '[]')) with ordinality t(x, n)
                       where (x ->> 'category') is distinct from 'pack' loop
    perform private.provision_service(v_id, v_item, v_pos);
  end loop;

  -- the salon's packs (and the payload's): never in a stylist's own service list
  v_packs := array(select x ->> 'id' from jsonb_array_elements(coalesce(p -> 'services', '[]')) x
                   where x ->> 'category' = 'pack' and x ->> 'id' is not null
                   union
                   select s.id from public.services s where s.salon_id = v_id and s.category = 'pack');

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
    v_svc_ids := array(select distinct s from jsonb_array_elements_text(coalesce(v_item -> 'services', '[]')) s
                       where s <> all (v_packs));
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
      delete from public.stylist_services ss
      where ss.stylist_id = v_sid and ss.salon_id = v_id and ss.service_id <> all (v_packs);
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

  -- packs: their person and included services exist by now
  for v_item, v_pos in select x, (n - 1)::int from jsonb_array_elements(coalesce(p -> 'services', '[]')) with ordinality t(x, n)
                       where x ->> 'category' = 'pack' loop
    perform private.provision_service(v_id, v_item, v_pos);
  end loop;

  if v_owner is not null then
    insert into private.staff (user_id, salon_id) values (v_owner, v_id) on conflict (user_id) do nothing;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.provision_salon(jsonb) from public, anon, authenticated;
grant execute on function public.provision_salon(jsonb) to service_role;

-- 4. demo_reset. Latest body: 20261115100100_demo_reset.sql. The prospect's services (packs included)
-- go before the snapshot is re-applied, the prospect's stylists after it (a pack may name one as its
-- person until the snapshot puts its own person back); every snapshot service is re-applied with its
-- promotion (none when the snapshot has no promo keys), moved to start on the reset day.
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
end;
$$;

revoke execute on function private.demo_reset(text) from public, anon, authenticated;
