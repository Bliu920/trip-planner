begin;

-- Private accepted candidate.
create table public.planning_drafts (
  operation_id text primary key references public.planning_runs(id) on delete cascade,
  trip_reference uuid not null references public.trips(reference) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  input_id text not null references public.messages(id) on delete cascade,
  generation uuid not null, base_revision bigint not null, version bigint not null default 0,
  status text not null default 'active' check(status in ('active','interrupted','published','discarded')),
  payload text check(payload is null or octet_length(payload)<=16777216),
  last_write uuid, updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days'
);
alter table public.planning_drafts enable row level security;
revoke all on public.planning_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.planning_drafts to service_role;

create function public.planning_draft_read(p_trip uuid,p_operation text,p_generation uuid)
returns jsonb language sql set search_path='' as $$
  select to_jsonb(d)||jsonb_build_object('head_revision',(select environment_revision from public.trips where reference=p_trip)) from public.planning_drafts d where d.trip_reference=p_trip and d.operation_id=p_operation and d.generation=p_generation;
$$;

-- Remove expired private contents.
create function public.planning_draft_prune(p_limit integer default 100) returns integer language plpgsql set search_path='' as $$
declare changed integer;
begin
  with expired as (select operation_id from public.planning_drafts where expires_at<=now() and payload is not null order by expires_at for update skip locked limit least(greatest(p_limit,1),1000))
  update public.planning_drafts d set payload=null,status=case when status='published' then 'published' else 'discarded' end,updated_at=now()
    from expired e where d.operation_id=e.operation_id;
  get diagnostics changed = row_count; return changed;
end;
$$;

-- Claim exact-input retry.
create function public.planning_draft_claim(p_trip uuid,p_operation text,p_generation uuid,p_enabled boolean)
returns jsonb language plpgsql set search_path='' as $$
declare rev bigint; r public.planning_runs; d public.planning_drafts;
begin
  select environment_revision into rev from public.trips where reference=p_trip for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  select r0.* into r from public.planning_runs r0 join public.messages m on m.id=r0.id
    where r0.id=p_operation and r0.trip_reference=p_trip and r0.deadline>now() and r0.withdrawn_by_message_id is null
      and m.generation_id=p_generation and m.status='streaming' for update of m;
  if not found then raise exception 'PLAN_ATTEMPT'; end if;
  perform public.planning_draft_prune();
  select * into d from public.planning_drafts where operation_id=p_operation for update;
  if not p_enabled then
    return jsonb_build_object('enabled',false,'resumeRequired',coalesce(d.payload is not null and d.status in ('active','interrupted'),false));
  end if;
  if exists(select 1 from public.planning_commits where operation_id=p_operation and trip_reference=p_trip) then
    return jsonb_build_object('enabled',true,'published',true);
  end if;
  if d.operation_id is not null then
    if d.trip_reference<>p_trip or d.conversation_id<>r.conversation_id or d.input_id<>r.input_id then raise exception 'PLAN_SOURCE'; end if;
    if d.expires_at<=now() or d.status='discarded' then return jsonb_build_object('enabled',true,'expired',true); end if;
    if d.base_revision<>rev then raise exception 'PLAN_CONFLICT'; end if;
    update public.planning_drafts set generation=p_generation,version=version+1,status='active',updated_at=now()
      where operation_id=p_operation returning * into d;
  else
    insert into public.planning_drafts(operation_id,trip_reference,conversation_id,input_id,generation,base_revision)
      values(p_operation,p_trip,r.conversation_id,r.input_id,p_generation,rev) returning * into d;
  end if;
  return jsonb_build_object('enabled',true,'draft',to_jsonb(d));
end;
$$;

-- Confirm one snapshot write.
create function public.planning_draft_put(p_trip uuid,p_operation text,p_generation uuid,p_expected bigint,p_base bigint,p_write uuid,p_payload text,p_rebase boolean default false)
returns jsonb language plpgsql set search_path='' as $$
declare rev bigint; d public.planning_drafts;
begin
  select environment_revision into rev from public.trips where reference=p_trip for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  perform 1 from public.planning_runs r join public.messages m on m.id=r.id
    where r.id=p_operation and r.trip_reference=p_trip and r.deadline>now() and r.withdrawn_by_message_id is null
      and m.generation_id=p_generation and m.status='streaming' for update of m;
  if not found then raise exception 'PLAN_ATTEMPT'; end if;
  select * into d from public.planning_drafts where operation_id=p_operation and trip_reference=p_trip for update;
  if not found or d.generation<>p_generation or d.status<>'active' then raise exception 'PLAN_ATTEMPT'; end if;
  if d.expires_at<=now() then raise exception 'DRAFT_EXPIRED'; end if;
  if rev<>p_base or (d.base_revision<>p_base and not p_rebase) then raise exception 'PLAN_CONFLICT'; end if;
  if d.last_write=p_write then
    if d.payload is distinct from p_payload then raise exception 'DRAFT_INVALID'; end if;
    return to_jsonb(d);
  end if;
  if d.version<>p_expected then raise exception 'DRAFT_CONFLICT'; end if;
  if p_payload is null or octet_length(p_payload)>16777216 or jsonb_typeof(p_payload::jsonb)<>'object'
    or p_payload::jsonb->>'schemaVersion'<>'1' then raise exception 'DRAFT_INVALID'; end if;
  if p_rebase and (p_payload::jsonb->'plan'<>'null'::jsonb or p_payload::jsonb->'budget'<>'null'::jsonb or p_payload::jsonb->'edits'<>'[]'::jsonb) then raise exception 'DRAFT_INVALID'; end if;
  update public.planning_drafts set payload=p_payload,last_write=p_write,base_revision=p_base,version=version+1,updated_at=now()
    where operation_id=p_operation returning * into d;
  return to_jsonb(d);
end;
$$;

-- Couple final publication marker.
create function public.planning_draft_published() returns trigger language plpgsql set search_path='' as $$
begin
  update public.planning_drafts set status='published',payload=null,updated_at=now()
    where operation_id=new.operation_id and trip_reference=new.trip_reference;
  return new;
end;
$$;
create trigger planning_draft_publication after insert on public.planning_commits for each row execute function public.planning_draft_published();

create function public.planning_draft_interrupted() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='complete' then
    update public.planning_drafts set status='discarded',updated_at=now()
      where operation_id=new.id and generation=coalesce(new.generation_id,old.generation_id) and status='active' and payload is null;
  elsif new.status in ('failed','interrupted') then
    update public.planning_drafts set status='interrupted',updated_at=now()
      where operation_id=new.id and generation=coalesce(new.generation_id,old.generation_id) and status='active';
  end if;
  return new;
end;
$$;
create trigger planning_draft_stop after update of status on public.messages for each row execute function public.planning_draft_interrupted();

create function public.planning_draft_withdrawn() returns trigger language plpgsql set search_path='' as $$
begin
  if new.withdrawn_by_message_id is not null then
    update public.planning_drafts set status='discarded',payload=null,updated_at=now() where operation_id=new.id and status<>'published';
  end if;
  return new;
end;
$$;
create trigger planning_draft_withdrawal after update of withdrawn_by_message_id on public.planning_runs for each row execute function public.planning_draft_withdrawn();

-- Advance own brief base atomically.
create or replace function public.planning_save_brief(p_trip uuid,p_operation text,p_generation uuid,p_expected bigint,p_write uuid)
returns jsonb language plpgsql set search_path='' as $$
declare revision bigint; w public.document_writes;
begin
  select environment_revision into revision from public.trips where reference=p_trip for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  perform 1 from public.planning_runs r join public.messages m on m.id=r.id
    where r.id=p_operation and r.trip_reference=p_trip and r.deadline>now()
      and r.withdrawn_by_message_id is null and m.generation_id=p_generation and m.status='streaming' for update of m;
  if not found or exists(select 1 from public.planning_commits where operation_id=p_operation) then raise exception 'PLAN_ATTEMPT'; end if;
  select * into w from public.document_writes where id=p_write and trip_reference=p_trip for update;
  if not found or w.kind<>'planning_context' or w.author<>'agent' then raise exception 'PLAN_INVALID'; end if;
  if w.published then return public.planning_snapshot(p_trip); end if;
  if revision<>p_expected then raise exception 'PLAN_CONFLICT'; end if;
  perform public.document_publish(p_trip,p_write);
  update public.planning_drafts set base_revision=(select environment_revision from public.trips where reference=p_trip),updated_at=now()
    where operation_id=p_operation and trip_reference=p_trip and generation=p_generation and status='active' and base_revision=p_expected;
  return public.planning_snapshot(p_trip);
end;
$$;
revoke all on function public.planning_draft_prune(integer),public.planning_draft_read(uuid,text,uuid),public.planning_draft_claim(uuid,text,uuid,boolean),public.planning_draft_put(uuid,text,uuid,bigint,bigint,uuid,text,boolean),public.planning_draft_published(),public.planning_draft_interrupted(),public.planning_draft_withdrawn() from public,anon,authenticated;
grant execute on function public.planning_draft_prune(integer),public.planning_draft_read(uuid,text,uuid),public.planning_draft_claim(uuid,text,uuid,boolean),public.planning_draft_put(uuid,text,uuid,bigint,bigint,uuid,text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
