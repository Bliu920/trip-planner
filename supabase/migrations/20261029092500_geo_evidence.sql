begin;
create table public.geo_evidence (
  id uuid primary key default gen_random_uuid(),
  trip_reference uuid not null references public.trips(reference) on delete cascade,
  cache_key text not null check(length(cache_key)=64),
  kind text not null check(kind in ('position','route')),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=2000000),
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index geo_cache on public.geo_evidence(trip_reference,cache_key,checked_at desc);
alter table public.geo_evidence enable row level security;
revoke all on public.geo_evidence from public,anon,authenticated;
grant select,insert on public.geo_evidence to service_role;
create function public.geo_read(p_trip uuid,p_key text,p_id uuid) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('id',id,'kind',kind,'payload',payload,'checkedAt',checked_at,'expiresAt',expires_at)
 from public.geo_evidence where trip_reference=p_trip and
   ((p_id is not null and id=p_id) or (p_id is null and cache_key=p_key and expires_at>now()))
 order by checked_at desc limit 1;
$$;
create function public.geo_record(p_trip uuid,p_key text,p_kind text,p_payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare row public.geo_evidence;
begin
 insert into public.geo_evidence(trip_reference,cache_key,kind,payload,expires_at)
 values(p_trip,p_key,p_kind,p_payload,now()+case when p_kind='position' then interval '7 days' else interval '1 day' end) returning * into row;
 return jsonb_build_object('id',row.id,'kind',row.kind,'payload',row.payload,'checkedAt',row.checked_at,'expiresAt',row.expires_at);
end;
$$;
create function public.validate_geo_plan() returns trigger language plpgsql set search_path='' as $$
declare source jsonb;
begin
 for source in select jsonb_path_query(new.content,'$.** ? (@.type == "geo")') loop
  if not exists(select 1 from public.geo_evidence where id::text=source->>'evidenceId' and trip_reference=new.trip_reference) then raise exception 'PLAN_SOURCE'; end if;
 end loop;
 for source in select jsonb_path_query(new.content,'$.** ? (exists(@.geoEvidenceId))') loop
  if source->>'geoEvidenceId' is not null and not exists(select 1 from public.geo_evidence where id::text=source->>'geoEvidenceId' and trip_reference=new.trip_reference and kind='position') then raise exception 'PLAN_SOURCE'; end if;
 end loop;
 return new;
end;
$$;
create trigger validate_geo_plan before insert or update of content on public.plans for each row execute function public.validate_geo_plan();
revoke all on function public.validate_geo_plan() from public,anon,authenticated;
revoke all on function public.geo_read(uuid,text,uuid),public.geo_record(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.geo_read(uuid,text,uuid),public.geo_record(uuid,text,text,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
