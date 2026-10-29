begin;
alter table public.trips add column environment_revision bigint not null default 0;
alter table public.trips add column planning_started boolean not null default false;
create table public.plans (
  trip_reference uuid primary key references public.trips(reference) on delete cascade,
  content jsonb not null check (jsonb_typeof(content)='object' and coalesce(jsonb_array_length(content->'days'),0)=3 and not content ? 'status'),
  format_version integer not null default 1 check (format_version=1),
  updated_at timestamptz not null default now()
);
create table public.plan_saves (
  id uuid primary key, trip_reference uuid not null references public.trips(reference) on delete cascade,
  revision bigint not null, plan_hash text not null, created_at timestamptz not null default now()
);
alter table public.plans enable row level security;
alter table public.plan_saves enable row level security;
revoke all on public.plans, public.plan_saves from anon,authenticated;
grant select,insert,update,delete on public.plans,public.plan_saves to service_role;

create function public.environment_changed() returns trigger language plpgsql set search_path='' as $$
begin
  update public.trips set environment_revision=environment_revision+1 where reference=coalesce(new.trip_reference,old.trip_reference);
  return coalesce(new,old);
end;
$$;
create trigger plan_environment after insert or update or delete on public.plans for each row execute function public.environment_changed();
create trigger document_environment after insert or update or delete on public.attachments for each row execute function public.environment_changed();
create function public.freeze_legacy_notes() returns trigger language plpgsql set search_path='' as $$
begin
  if old.planning_started and new.notes is distinct from old.notes then raise exception 'PLANNING_NOTES_FROZEN'; end if;
  return new;
end;
$$;
create trigger trips_notes_guard before update on public.trips for each row execute function public.freeze_legacy_notes();

create function public.plan_get(p_trip uuid) returns jsonb language plpgsql set search_path='' as $$
declare revision bigint; content jsonb;
begin
  select environment_revision into revision from public.trips where reference=p_trip;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  select p.content into content from public.plans p where trip_reference=p_trip;
  return jsonb_build_object('revision',revision,'plan',content);
end;
$$;
-- Domain persistence contract for coordinated transactions.
create function public.plan_apply(p_trip uuid,p_plan jsonb) returns void language plpgsql set search_path='' as $$
begin
  if p_plan is null or jsonb_typeof(p_plan)<>'object' or coalesce(jsonb_array_length(p_plan->'days'),0)<>3 or p_plan ? 'status' or octet_length(p_plan::text)>524288 then raise exception 'PLAN_INVALID'; end if;
  insert into public.plans(trip_reference,content) values(p_trip,p_plan)
    on conflict(trip_reference) do update set content=excluded.content,updated_at=now();
  update public.trips set planning_started=true where reference=p_trip;
end;
$$;
create function public.plan_save(p_trip uuid,p_expected bigint,p_plan jsonb,p_request uuid) returns jsonb language plpgsql set search_path='' as $$
declare current_revision bigint; saved public.plan_saves;
begin
  select environment_revision into current_revision from public.trips where reference=p_trip for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  select * into saved from public.plan_saves where id=p_request;
  if found then
    if saved.trip_reference<>p_trip or saved.plan_hash<>md5(p_plan::text) then raise exception 'PLAN_CONFLICT'; end if;
    return jsonb_build_object('savedRevision',saved.revision,'snapshot',public.plan_get(p_trip));
  end if;
  if current_revision<>p_expected then raise exception 'PLAN_CONFLICT'; end if;
  perform public.plan_apply(p_trip,p_plan);
  select environment_revision into current_revision from public.trips where reference=p_trip;
  insert into public.plan_saves(id,trip_reference,revision,plan_hash) values(p_request,p_trip,current_revision,md5(p_plan::text));
  return jsonb_build_object('savedRevision',current_revision,'snapshot',public.plan_get(p_trip));
end;
$$;
revoke all on function public.plan_get(uuid),public.plan_apply(uuid,jsonb),public.plan_save(uuid,bigint,jsonb,uuid),public.environment_changed(),public.freeze_legacy_notes() from public,anon,authenticated;
grant execute on function public.plan_get(uuid),public.plan_apply(uuid,jsonb),public.plan_save(uuid,bigint,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
commit;
