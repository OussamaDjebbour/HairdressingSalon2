-- Part 3: many salons. Each salon's branding (palette, hero photo, story and claims), the
-- domain -> salon lookup, the public photo bucket and provision_salon, the service-role-only
-- function the product owner's script uses to create or update a whole salon.
-- Branding is written only by the product owner: no write grants or policies for anon/authenticated.

-- Branding columns. The palette default is Élégance's rose scale (tailwind.config.js) so the
-- column can be NOT NULL; only the primary scale varies per salon (cream and gold stay fixed).
alter table public.salons
  add column name_ar text,
  add column palette jsonb not null default
    '{"50":"#FBF1F3","100":"#F7E0E5","200":"#EFC1CC","300":"#E29FB1","400":"#D17D93","500":"#B85F76","600":"#9D4B5F","700":"#7E3B4C","800":"#5F2D3A","900":"#421F28"}'
    check (jsonb_typeof(palette) = 'object'
      and palette ?& array['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']
      and jsonb_array_length(jsonb_path_query_array(palette, '$.*')) = 10
      and not jsonb_path_exists(palette, '$.* ? (@.type() != "string" || !(@ like_regex "^#[0-9A-F]{6}$"))')),
  add column hero_image text not null default '',
  add column founder_name jsonb,
  add column founder_role jsonb,
  add column story jsonb,
  add column story_intro jsonb,
  add column years_open integer check (years_open > 0),
  add column client_count integer check (client_count > 0),
  add column rating numeric(2,1) check (rating between 1 and 5),
  add column review_count integer check (review_count > 0);

-- salons was readable and (RLS-blocked) writable by default grants; make it read-only for the API roles.
revoke insert, update, delete, truncate on public.salons from anon, authenticated;

-- Élégance looks exactly as today.
update public.salons set
  hero_image = 'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=900',
  founder_name = '{"fr":"Amina","ar":"أمينة"}',
  founder_role = '{"fr":"Fondatrice & coiffeuse","ar":"المؤسِّسة وخبيرة التصفيف"}',
  story = '{"fr":"« La beauté n’est pas un luxe. C’est un rituel. »","ar":"«الجمالُ ليس رفاهية، بل طقسٌ يومي.»"}',
  story_intro = '{"fr":"Depuis quinze ans au cœur d’Alger, nous recevons chaque cliente comme une invitée : un moment suspendu, des gestes précis, et le soin d’un métier transmis.","ar":"منذ خمسة عشر عامًا في قلب الجزائر العاصمة، نستقبل كل عميلة كضيفة عزيزة: لحظة من الهدوء، لمسات دقيقة، وعناية حرفةٍ متوارثة."}',
  years_open = 15,
  client_count = 2500,
  rating = 4.9,
  review_count = 240,
  city = jsonb_set(city, '{ar}', '"الجزائر العاصمة"')
where id = 'elegance';

-- Which salon a host name belongs to. Stored lowercase, without a port, trailing dot or leading www.
create table public.salon_domains (
  domain text primary key
    check (domain = lower(domain) and domain !~ '^www\.' and domain !~ '[:/ ]' and domain !~ '\.$'),
  salon_id text not null references public.salons on delete cascade
);
alter table public.salon_domains enable row level security;
create policy salon_domains_read on public.salon_domains for select to anon, authenticated using (true);
grant select on public.salon_domains to anon, authenticated;
revoke insert, update, delete, truncate on public.salon_domains from anon, authenticated;

-- 'WWW.Sara-Salon.com.:443' -> 'sara-salon.com'
create function private.normalize_host(p text)
returns text language sql immutable set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(lower(btrim(coalesce(p, ''))), ':[0-9]*$', ''),
             '\.+$', ''),
           '^www\.', '')
$$;

-- {fr, ar} text: null when the French text is empty; an empty Arabic text falls back to the French.
create function private.bilingual(p jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'object' and btrim(coalesce(p ->> 'fr', '')) <> '' then
    jsonb_build_object('fr', btrim(p ->> 'fr'),
                       'ar', coalesce(nullif(btrim(coalesce(p ->> 'ar', '')), ''), btrim(p ->> 'fr')))
  end
$$;

-- Validates a week of opening hours (7 items {weekday 1..7, opens, closes}, HH:MM in 15-minute
-- steps, opens < closes, both or neither) and replaces the salon's salon_hours. Raises invalid_hours.
-- Shared by admin_set_hours and provision_salon.
create function private.set_hours(p_salon_id text, p_hours jsonb)
returns void
language plpgsql volatile set search_path = ''
as $$
declare
  v_item   jsonb;
  v_days   integer[] := array[]::integer[];
  v_wd     integer;
  v_opens  text;
  v_closes text;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) <> 7 then
    raise exception 'invalid_hours' using errcode = 'P0001';
  end if;
  for v_item in select * from jsonb_array_elements(p_hours) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'weekday', '') !~ '^[1-7]$' then
      raise exception 'invalid_hours' using errcode = 'P0001';
    end if;
    v_wd := (v_item ->> 'weekday')::int;
    v_opens := nullif(v_item ->> 'opens', '');
    v_closes := nullif(v_item ->> 'closes', '');
    if v_wd = any (v_days) or (v_opens is null) <> (v_closes is null) then
      raise exception 'invalid_hours' using errcode = 'P0001';
    end if;
    if v_opens is not null then
      if v_opens !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$' or v_closes !~ '^([01][0-9]|2[0-3]):(00|15|30|45)$'
         or v_opens::time >= v_closes::time then
        raise exception 'invalid_hours' using errcode = 'P0001';
      end if;
    end if;
    v_days := v_days || v_wd;
  end loop;

  delete from public.salon_hours h where h.salon_id = p_salon_id;
  insert into public.salon_hours (salon_id, weekday, opens, closes)
  select p_salon_id, (e ->> 'weekday')::smallint, nullif(e ->> 'opens', '')::time, nullif(e ->> 'closes', '')::time
  from jsonb_array_elements(p_hours) e;
end;
$$;

-- The owner's rules for salon contact info, shared by admin_save_salon_info and provision_salon:
-- whatsapp normalised, empty -> null, else an Algerian mobile (invalid_phone); urls empty -> null,
-- else https:// (invalid_url); address/city {fr, ar} trimmed, empty Arabic -> French, <= 200 chars (invalid_name).
create function private.clean_salon_info(
  p_address jsonb, p_city jsonb, p_whatsapp text, p_instagram_url text, p_facebook_url text,
  out address jsonb, out city jsonb, out whatsapp text, out instagram_url text, out facebook_url text)
language plpgsql stable set search_path = ''
as $$
begin
  whatsapp := nullif(private.normalize_phone(p_whatsapp), '');
  instagram_url := nullif(btrim(coalesce(p_instagram_url, '')), '');
  facebook_url := nullif(btrim(coalesce(p_facebook_url, '')), '');
  if whatsapp is not null and whatsapp !~ '^0[5-7][0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  if (instagram_url is not null and instagram_url !~ '^https://') or (facebook_url is not null and facebook_url !~ '^https://') then
    raise exception 'invalid_url' using errcode = 'P0001';
  end if;
  address := jsonb_build_object('fr', btrim(coalesce(p_address ->> 'fr', '')),
               'ar', coalesce(nullif(btrim(coalesce(p_address ->> 'ar', '')), ''), btrim(coalesce(p_address ->> 'fr', ''))));
  city := jsonb_build_object('fr', btrim(coalesce(p_city ->> 'fr', '')),
            'ar', coalesce(nullif(btrim(coalesce(p_city ->> 'ar', '')), ''), btrim(coalesce(p_city ->> 'fr', ''))));
  if length(address ->> 'fr') > 200 or length(address ->> 'ar') > 200
     or length(city ->> 'fr') > 200 or length(city ->> 'ar') > 200 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function private.normalize_host(text) from public, anon, authenticated;
revoke execute on function private.bilingual(jsonb) from public, anon, authenticated;
revoke execute on function private.set_hours(text, jsonb) from public, anon, authenticated;
revoke execute on function private.clean_salon_info(jsonb, jsonb, text, text, text) from public, anon, authenticated;

-- The owner RPCs now use the shared helpers (same behaviour; grants are kept by create or replace).
create or replace function public.admin_set_hours(p_hours jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  perform private.set_hours(v_salon, p_hours);
end;
$$;

create or replace function public.admin_save_salon_info(
  p_address jsonb, p_city jsonb, p_whatsapp text, p_instagram_url text, p_facebook_url text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_salon text := private.my_salon();
  v_info  record;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into v_info from private.clean_salon_info(p_address, p_city, p_whatsapp, p_instagram_url, p_facebook_url);
  update public.salons s
  set address = v_info.address, city = v_info.city, whatsapp = v_info.whatsapp,
      instagram_url = v_info.instagram_url, facebook_url = v_info.facebook_url
  where s.id = v_salon;
end;
$$;

-- Salon photos: public read through public URLs; only the service role writes (no policies).
insert into storage.buckets (id, name, public) values ('salon-photos', 'salon-photos', true)
on conflict do nothing;

create function public.provision_salon(p jsonb)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
-- Creates or updates a whole salon; idempotent (re-running a payload changes nothing).
-- Service role only. Raises (P0001): invalid_id, invalid_name, invalid_palette, invalid_domain,
-- invalid_hours, invalid_phone, invalid_url, invalid_service, invalid_stylist, unknown_service,
-- domain_taken, id_taken, staff_taken.
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
--   "services": [{"id": "sara-coupe", "category": "coiffure" | "beaute",   required
--                 "name": {"fr", "ar"}, "price": 2000, "duration": 45,    required; DA; minutes, 15..600 in 15-minute steps
--                 "description": {"fr", "ar"}, "image": "https://…", "icon": "scissors",
--                 "sort_order": 0, "active": true}],
--   "stylists": [{"id": "sara-yasmine", "name": "Yasmine",                 required
--                 "role": {"fr", "ar"}, "specialties": [{"fr", "ar"}], "image": "https://…",
--                 "sort_order": 0, "active": true,
--                 "services": ["sara-coupe"],                            ids of this salon's services
--                 "weekdays": [2, 3, 4, 5, 6]}],
--   "owner_user_id": "uuid"             optional: an auth.users id made staff of this salon
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
    insert into public.salon_domains (domain, salon_id) select d, v_id from unnest(v_domains) d
    on conflict (domain) do nothing;
  end if;

  if p ? 'hours' then
    perform private.set_hours(v_id, p -> 'hours');
  end if;

  for v_item, v_pos in select x, (n - 1)::int from jsonb_array_elements(coalesce(p -> 'services', '[]')) with ordinality t(x, n) loop
    v_sid := v_item ->> 'id';
    v_cat := v_item ->> 'category';
    if coalesce(v_sid, '') !~ '^[a-z0-9][a-z0-9-]{1,59}$' or v_cat is null or v_cat not in ('coiffure', 'beaute')
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
            coalesce(nullif(btrim(coalesce(v_item ->> 'icon', '')), ''), case v_cat when 'beaute' then 'sparkles' else 'scissors' end),
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
      active      = case when v_item ? 'active' then excluded.active else s.active end;
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
      active      = case when v_item ? 'active' then excluded.active else st.active end;

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

revoke execute on function public.provision_salon(jsonb) from public, anon, authenticated;
grant execute on function public.provision_salon(jsonb) to service_role;
