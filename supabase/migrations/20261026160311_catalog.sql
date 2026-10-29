begin;

-- Preserve supplied place facts.
create table public.places (
  id text primary key check (id ~ '^place_[0-9]+$'),
  name text not null,
  type text not null,
  city text not null,
  region text not null,
  neighborhood text,
  description text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  hours text,
  duration_minutes integer check (duration_minutes > 0),
  price_range text not null,
  rating double precision not null check (rating between 0 and 5),
  tags text[] not null,
  seasonal_notes text,
  booking_required boolean,
  source_order integer not null unique check (source_order >= 0)
);
create index places_city_type_idx on public.places (city, type);

-- Keep enrichment independently editable.
create table public.place_photos (
  place_id text primary key references public.places(id) on delete cascade,
  provider text not null check (provider in ('pexels', 'unsplash')),
  provider_id text not null,
  url text not null check (url ~ '^https://(images\.pexels\.com|images\.unsplash\.com)/'),
  source_url text not null check (source_url ~ '^https://(www\.pexels\.com|unsplash\.com)/'),
  photographer text not null,
  alt text not null,
  match text not null check (match in ('place', 'illustrative')),
  verified_at date not null
);

-- Read through the server.
alter table public.places enable row level security;
alter table public.place_photos enable row level security;
revoke all on public.places, public.place_photos from anon, authenticated;
grant select, insert, update, delete on public.places, public.place_photos to service_role;

notify pgrst, 'reload schema';
commit;
