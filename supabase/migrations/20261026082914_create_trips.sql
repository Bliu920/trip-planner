begin;

create table public.trips (
  reference uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.set_trip_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trips_updated_at before update on public.trips
for each row execute function public.set_trip_updated_at();

alter table public.trips enable row level security;
revoke all on public.trips from anon, authenticated;
grant select, insert, update on public.trips to service_role;

commit;
