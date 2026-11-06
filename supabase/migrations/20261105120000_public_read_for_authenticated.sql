-- SP1's read policies were anon-only. Once staff log in (SP2), the same browser
-- calls the API as `authenticated` and the public site/wizard would see no rows.
alter policy "public read services" on public.services to anon, authenticated;
alter policy "public read stylists" on public.stylists to anon, authenticated;
