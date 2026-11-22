-- Service categories: more ready-made keys, and categories the owner makes herself.
-- A service of category 'custom' points at one of its salon's rows in salon_categories.

create table public.salon_categories (
  id         text primary key,
  salon_id   text not null references public.salons (id),
  name       jsonb not null,
  sort_order integer not null default 0,
  unique (salon_id, id)
);
alter table public.salon_categories enable row level security;
create policy "public read salon_categories" on public.salon_categories for select to anon, authenticated using (true);
revoke all on public.salon_categories from public, anon, authenticated;
grant select on public.salon_categories to anon, authenticated;

alter table public.services
  add column custom_category_id text,
  add constraint services_custom_category_fk foreign key (salon_id, custom_category_id)
    references public.salon_categories (salon_id, id) on delete restrict,
  add constraint services_custom_category check ((category = 'custom') = (custom_category_id is not null));

create or replace function private.category_icon(p_category text)
returns text
language sql immutable
as $$
  select case p_category when 'coiffure' then 'scissors' when 'beaute' then 'sparkles' when 'spa' then 'flower'
                         when 'pack' then 'gift' when 'capillaire' then 'sparkles' when 'visage' then 'heart'
                         when 'regard' then 'sparkles' when 'ongles' then 'hand' when 'epilation' then 'sparkles'
                         when 'maquillage' then 'brush' when 'massage' then 'hand' when 'custom' then 'sparkles' end
$$;

-- admin_save_service: the packs/promotions body plus p_custom_category_id (a signature change: drop and
-- recreate, same grants). 'custom' needs one of this salon's categories, else invalid_category; any other
-- category stores none.
drop function public.admin_save_service(text, jsonb, jsonb, text, integer, integer, integer, text[], text, integer, date, date);
create function public.admin_save_service(
  p_id text, p_name jsonb, p_description jsonb, p_category text,
  p_price integer, p_duration integer, p_sort_order integer,
  p_includes text[] default '{}', p_pack_stylist_id text default null,
  p_promo_price integer default null, p_promo_from date default null, p_promo_to date default null,
  p_custom_category_id text default null)
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
  v_pack     boolean := p_category = 'pack';
  v_old_cat  text;
  v_includes text[] := '{}'::text[];
  v_stylist  text;
  v_custom   text := case when p_category = 'custom' then p_custom_category_id end;
begin
  if v_salon is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if length(v_name_fr) not between 2 and 80
     or p_category is null or p_category not in ('pack', 'coiffure', 'capillaire', 'visage', 'regard', 'ongles', 'epilation',
                                        'maquillage', 'beaute', 'spa', 'massage', 'custom') then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  -- An owner's own category: one of this salon's (another salon's id is as good as none).
  if p_category = 'custom' and not exists (
    select 1 from public.salon_categories c where c.id = p_custom_category_id and c.salon_id = v_salon
  ) then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;
  if p_price is null or p_price not between 0 and 1000000 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;
  if p_duration is null or p_duration not between 15 and 600 or p_duration % 15 <> 0 then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  if num_nonnulls(p_promo_price, p_promo_from, p_promo_to) not in (0, 3)
     or p_promo_price < 0 or p_promo_price >= p_price or p_promo_from > p_promo_to then
    raise exception 'invalid_promo' using errcode = 'P0001';
  end if;

  if p_id is not null then
    select s.category into v_old_cat from public.services s where s.id = p_id and s.salon_id = v_salon;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    if (v_old_cat = 'pack') <> v_pack then
      raise exception 'invalid_pack' using errcode = 'P0001';
    end if;
  end if;

  if v_pack then
    if not exists (
      select 1 from public.stylists st where st.id = p_pack_stylist_id and st.salon_id = v_salon and st.active
    ) then
      raise exception 'invalid_pack' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from unnest(coalesce(p_includes, '{}'::text[])) sid
      where sid is null or not exists (
        select 1 from public.services s where s.id = sid and s.salon_id = v_salon and s.category <> 'pack')
    ) then
      raise exception 'invalid_pack' using errcode = 'P0001';
    end if;
    v_includes := array(select u.sid from unnest(coalesce(p_includes, '{}'::text[])) with ordinality u(sid, n)
                        group by u.sid order by min(u.n));
    v_stylist := p_pack_stylist_id;
  end if;

  if p_id is null then
    v_id := gen_random_uuid()::text;
    insert into public.services (id, salon_id, category, name, description, price, duration, image, icon, sort_order,
                                 includes, pack_stylist_id, promo_price, promo_from, promo_to, custom_category_id)
    values (v_id, v_salon, p_category,
            v_name, coalesce(v_desc, '{"fr":"","ar":""}'::jsonb), p_price, p_duration, '',
            private.category_icon(p_category),
            coalesce(p_sort_order, 0),
            v_includes, v_stylist, p_promo_price, p_promo_from, p_promo_to, v_custom);
  else
    update public.services s
    set name = v_name,
        description = coalesce(v_desc, s.description),
        category = p_category, price = p_price, duration = p_duration,
        -- A category change moves the icon along only while it is still the old category's default.
        icon = case when s.category <> p_category and s.icon = private.category_icon(s.category)
                    then private.category_icon(p_category) else s.icon end,
        sort_order = coalesce(p_sort_order, s.sort_order),
        includes = v_includes, pack_stylist_id = v_stylist,
        promo_price = p_promo_price, promo_from = p_promo_from, promo_to = p_promo_to,
        custom_category_id = v_custom
    where s.id = p_id and s.salon_id = v_salon;
  end if;

  -- A pack's person responsible is its only stylist_services row (who can be booked for it).
  if v_pack then
    delete from public.stylist_services ss where ss.salon_id = v_salon and ss.service_id = v_id;
    insert into public.stylist_services (salon_id, stylist_id, service_id) values (v_salon, v_stylist, v_id);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.admin_save_service(text, jsonb, jsonb, text, integer, integer, integer, text[], text, integer, date, date, text)
  from public, anon, authenticated;
grant execute on function public.admin_save_service(text, jsonb, jsonb, text, integer, integer, integer, text[], text, integer, date, date, text)
  to authenticated;
