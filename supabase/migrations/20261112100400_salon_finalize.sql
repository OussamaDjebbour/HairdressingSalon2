-- Every row must now name its salon explicitly: drop the temporary 'elegance' defaults.
alter table public.services           alter column salon_id drop default;
alter table public.stylists           alter column salon_id drop default;
alter table public.stylist_services   alter column salon_id drop default;
alter table private.bookings          alter column salon_id drop default;
alter table private.staff             alter column salon_id drop default;
alter table private.push_subscriptions alter column salon_id drop default;
