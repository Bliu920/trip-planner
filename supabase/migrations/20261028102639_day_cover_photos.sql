begin;

-- Shared decorative day covers.
create table public.day_cover_photos (
  slot smallint primary key check (slot between 1 and 3),
  url text not null unique check (url ~ '^https://images\.pexels\.com/photos/[0-9]+/pexels-photo-[0-9]+\.jpeg$'),
  source_url text not null unique check (source_url ~ '^https://www\.pexels\.com/photo/'),
  photographer text not null check (length(photographer)>0),
  alt text not null check (length(alt)>0),
  verified_at date not null
);
alter table public.day_cover_photos enable row level security;
revoke all on public.day_cover_photos from anon, authenticated;
grant select, insert, update, delete on public.day_cover_photos to service_role;

insert into public.day_cover_photos (slot,url,source_url,photographer,alt,verified_at) values
(1,'https://images.pexels.com/photos/29990361/pexels-photo-29990361.jpeg','https://www.pexels.com/photo/scenic-tuscan-countryside-with-farmhouse-29990361/','Duc Tinh Ngo','Illustrative travel photo: farmhouse and rolling hills in Tuscany.','2026-10-28'),
(2,'https://images.pexels.com/photos/36819331/pexels-photo-36819331.jpeg','https://www.pexels.com/photo/outdoor-cafe-scene-with-coffee-and-pastry-36819331/','Kateryna Tartachna','Illustrative travel photo: coffee and pastry on a colorful cafe table.','2026-10-28'),
(3,'https://images.pexels.com/photos/23458651/pexels-photo-23458651.jpeg','https://www.pexels.com/photo/beach-umbrellas-and-sunbeds-on-boardwalk-on-seashore-in-italy-23458651/','Tatsiana Sa','Illustrative travel photo: parasols beside the sea on the Italian coast.','2026-10-28');

notify pgrst,'reload schema';
commit;
