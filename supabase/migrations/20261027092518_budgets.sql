begin;
create table public.budgets (
  trip_reference uuid primary key references public.trips(reference) on delete cascade,
  content jsonb not null check (jsonb_typeof(content)='object'),
  plan_hash text,
  updated_at timestamptz not null default now()
);
create table public.budget_saves (
  id uuid primary key, trip_reference uuid not null references public.trips(reference) on delete cascade,
  revision bigint not null, content_hash text not null, created_at timestamptz not null default now()
);
alter table public.budgets enable row level security;
alter table public.budget_saves enable row level security;
revoke all on public.budgets,public.budget_saves from public,anon,authenticated;
grant select,insert,update,delete on public.budgets,public.budget_saves to service_role;
create trigger budget_environment after insert or update or delete on public.budgets for each row execute function public.environment_changed();

create function public.budget_get(p_trip uuid) returns jsonb language plpgsql set search_path='' as $$
declare rev bigint; b public.budgets; p jsonb;
begin
  select environment_revision into rev from public.trips where reference=p_trip;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  select * into b from public.budgets where trip_reference=p_trip;
  select content into p from public.plans where trip_reference=p_trip;
  return jsonb_build_object('revision',rev,'budget',b.content,'needsReview',b.content is not null and b.plan_hash is distinct from md5(coalesce(p::text,'null')),'plan',p);
end;
$$;
create function public.budget_apply(p_trip uuid,p_budget jsonb,p_reviewed boolean) returns void language plpgsql set search_path='' as $$
declare e jsonb; s jsonb; item text; p jsonb; fingerprint text;
begin
  if jsonb_typeof(p_budget)<>'object' or p_budget->>'currency'<>'EUR' or jsonb_typeof(p_budget->'entries')<>'array' or jsonb_array_length(p_budget->'entries')>100 or octet_length(p_budget::text)>262144 then raise exception 'PLAN_INVALID'; end if;
  select content into p from public.plans where trip_reference=p_trip;
  for e in select value from jsonb_array_elements(p_budget->'entries') loop
    for item in select jsonb_array_elements_text(e->'planItemIds') loop
      if not coalesce(p->'items' ? item,false) then raise exception 'PLAN_INVALID'; end if;
    end loop;
    for s in select value from jsonb_array_elements(e->'sources') loop
      if s->>'documentId' is not null then
        if s->>'documentRevision' is null then
          perform public.planning_sources(p_trip,jsonb_build_array(jsonb_build_object('type','attachment','attachmentId',s->>'documentId')));
        else
          perform public.planning_sources(p_trip,jsonb_build_array(jsonb_build_object('type','document','documentId',s->>'documentId','revision',(s->>'documentRevision')::integer)));
        end if;
      end if;
    end loop;
  end loop;
  if p_reviewed then fingerprint:=md5(coalesce(p::text,'null'));
  else select plan_hash into fingerprint from public.budgets where trip_reference=p_trip; end if;
  insert into public.budgets(trip_reference,content,plan_hash) values(p_trip,p_budget,fingerprint)
    on conflict(trip_reference) do update set content=excluded.content,plan_hash=excluded.plan_hash,updated_at=now();
end;
$$;
create function public.budget_save(p_trip uuid,p_expected bigint,p_budget jsonb,p_request uuid,p_reviewed boolean) returns jsonb language plpgsql set search_path='' as $$
declare rev bigint; saved public.budget_saves; hash text:=md5(p_budget::text||p_reviewed::text);
begin
  select environment_revision into rev from public.trips where reference=p_trip for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  select * into saved from public.budget_saves where id=p_request;
  if found then
    if saved.trip_reference<>p_trip or saved.content_hash<>hash then raise exception 'PLAN_CONFLICT'; end if;
    return jsonb_build_object('savedRevision',saved.revision,'snapshot',public.budget_get(p_trip));
  end if;
  if rev<>p_expected then raise exception 'PLAN_CONFLICT'; end if;
  perform public.budget_apply(p_trip,p_budget,p_reviewed);
  select environment_revision into rev from public.trips where reference=p_trip;
  insert into public.budget_saves(id,trip_reference,revision,content_hash) values(p_request,p_trip,rev,hash);
  return jsonb_build_object('savedRevision',rev,'snapshot',public.budget_get(p_trip));
end;
$$;
create or replace function public.planning_snapshot(p_trip uuid) returns jsonb language plpgsql set search_path='' as $$
declare t public.trips; result jsonb;
begin
  select * into t from public.trips where reference=p_trip for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  result:=public.plan_get(p_trip);
  return result || jsonb_build_object('budget',(public.budget_get(p_trip)->'budget'),'budgetNeedsReview',(public.budget_get(p_trip)->'needsReview'),'tripReference',p_trip,'legacyNotes',t.notes,'initialized',t.planning_started,'documents',public.document_list(p_trip),
    'contextDocumentId',(select id from public.attachments where trip_reference=p_trip and kind='planning_context' and status='ready'),
    'pendingInputs',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'operationId',r.id,'conversationId',m.conversation_id,'parts',m.parts) order by m.position),'[]'::jsonb)
      from public.planning_runs r join public.messages m on m.id=r.input_id join public.messages reply on reply.id=r.id
      where r.trip_reference=p_trip and r.withdrawn_by_message_id is null and reply.status in ('failed','interrupted')
      and not exists(select 1 from public.planning_commits c where c.trip_reference=p_trip and m.id=any(c.handled_inputs))));
end;
$$;
create function public.planning_commit_budget(p_trip uuid,p_operation text,p_generation uuid,p_expected bigint,p_plan jsonb,p_writes uuid[],p_sources jsonb,p_handled text[],p_summary text,p_budget jsonb,p_budget_reviewed boolean)
returns jsonb language plpgsql set search_path='' as $$
declare revision bigint; receipt public.planning_commits; w uuid; documents uuid[]:='{}';
begin
  select environment_revision into revision from public.trips where reference=p_trip for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  select * into receipt from public.planning_commits where operation_id=p_operation;
  if found then
    if receipt.trip_reference<>p_trip then raise exception 'PLAN_CONFLICT'; end if;
    return jsonb_build_object('receipt',to_jsonb(receipt),'snapshot',public.planning_snapshot(p_trip));
  end if;
  perform 1 from public.planning_runs r join public.messages m on m.id=r.id where r.id=p_operation and r.trip_reference=p_trip and r.deadline>now() and r.withdrawn_by_message_id is null and m.generation_id=p_generation and m.status='streaming' for update of m;
  if not found then raise exception 'PLAN_ATTEMPT'; end if;
  if revision<>p_expected then raise exception 'PLAN_CONFLICT'; end if;
  if (p_plan is null and p_budget is null and cardinality(p_writes)=0) or cardinality(p_writes)>8 or char_length(p_summary)>2000 then raise exception 'PLAN_INVALID'; end if;
  if exists(select 1 from unnest(p_handled) i where not exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=i and m.role='user' and c.trip_reference=p_trip)) then raise exception 'PLAN_SOURCE'; end if;
  -- Publish through module contracts.
  foreach w in array p_writes loop
    perform public.document_publish(p_trip,w);
    documents:=array_append(documents,(select document_id from public.document_writes where id=w));
  end loop;
  perform public.planning_sources(p_trip,p_sources);
  if p_plan is not null then perform public.plan_apply(p_trip,p_plan); end if;
  if p_budget is not null then perform public.budget_apply(p_trip,p_budget,p_budget_reviewed); end if;
  select environment_revision into revision from public.trips where reference=p_trip;
  insert into public.planning_commits(operation_id,trip_reference,revision,summary,document_ids,handled_inputs) values(p_operation,p_trip,revision,p_summary,documents,p_handled) returning * into receipt;
  return jsonb_build_object('receipt',to_jsonb(receipt),'snapshot',public.planning_snapshot(p_trip));
end;
$$;

revoke all on function public.budget_get(uuid),public.budget_apply(uuid,jsonb,boolean),public.budget_save(uuid,bigint,jsonb,uuid,boolean),public.planning_commit_budget(uuid,text,uuid,bigint,jsonb,uuid[],jsonb,text[],text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.budget_get(uuid),public.budget_apply(uuid,jsonb,boolean),public.budget_save(uuid,bigint,jsonb,uuid,boolean),public.planning_commit_budget(uuid,text,uuid,bigint,jsonb,uuid[],jsonb,text[],text,jsonb,boolean) to service_role;
notify pgrst,'reload schema';
commit;
