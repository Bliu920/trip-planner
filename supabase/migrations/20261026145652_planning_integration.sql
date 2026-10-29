begin;
create table public.planning_runs (
  id text primary key references public.messages(id) on delete cascade,
  trip_reference uuid not null references public.trips(reference) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  input_id text not null references public.messages(id) on delete cascade,
  deadline timestamptz not null,
  withdrawn_by_message_id text references public.messages(id),
  created_at timestamptz not null default now()
);
create table public.planning_commits (
  operation_id text primary key, trip_reference uuid not null references public.trips(reference) on delete cascade,
  revision bigint not null, summary text not null, document_ids uuid[] not null default '{}',
  handled_inputs text[] not null default '{}', created_at timestamptz not null default now()
);
alter table public.planning_runs enable row level security;
alter table public.planning_commits enable row level security;
revoke all on public.planning_runs,public.planning_commits from anon,authenticated;
grant select,insert,update on public.planning_runs,public.planning_commits to service_role;

create function public.planning_snapshot(p_trip uuid) returns jsonb language plpgsql set search_path='' as $$
declare t public.trips; result jsonb;
begin
  select * into t from public.trips where reference=p_trip for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  result:=public.plan_get(p_trip);
  return result || jsonb_build_object('tripReference',p_trip,'legacyNotes',t.notes,'initialized',t.planning_started,'documents',public.document_list(p_trip),
    'contextDocumentId',(select id from public.attachments where trip_reference=p_trip and kind='planning_context' and status='ready'),
    'pendingInputs',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'operationId',r.id,'conversationId',m.conversation_id,'parts',m.parts) order by m.position),'[]'::jsonb)
      from public.planning_runs r join public.messages m on m.id=r.input_id join public.messages reply on reply.id=r.id
      where r.trip_reference=p_trip and r.withdrawn_by_message_id is null and reply.status in ('failed','interrupted')
      and not exists(select 1 from public.planning_commits c where c.trip_reference=p_trip and m.id=any(c.handled_inputs))));
end;
$$;
create function public.planning_begin(p_trip uuid,p_conversation uuid,p_reply text,p_generation uuid) returns jsonb language plpgsql set search_path='' as $$
declare input text;
begin
  perform 1 from public.trips where reference=p_trip for update;
  perform 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=p_reply and m.conversation_id=p_conversation and c.trip_reference=p_trip and m.status='streaming' and m.generation_id=p_generation for update of m;
  if not found then raise exception 'PLAN_ATTEMPT'; end if;
  select id into input from public.messages where conversation_id=p_conversation and role='user' order by position desc limit 1;
  insert into public.planning_runs(id,trip_reference,conversation_id,input_id,deadline) values(p_reply,p_trip,p_conversation,input,now()+interval '240 seconds')
    on conflict(id) do update set deadline=excluded.deadline;
  update public.trips set planning_started=true where reference=p_trip;
  return jsonb_build_object('snapshot',public.planning_snapshot(p_trip),'inputId',input,'receipt',(select to_jsonb(c) from public.planning_commits c where operation_id=p_reply and trip_reference=p_trip));
end;
$$;
create function public.planning_sources(p_trip uuid,p_sources jsonb) returns boolean language plpgsql set search_path='' as $$
declare s jsonb;
begin
  for s in select value from jsonb_array_elements(p_sources) loop
    if s->>'type'='message' and not exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=s->>'messageId' and c.id::text=s->>'conversationId' and c.trip_reference=p_trip and m.role='user') then raise exception 'PLAN_SOURCE'; end if;
    if s->>'type'='attachment' and not exists(select 1 from public.attachments where id::text=s->>'attachmentId' and trip_reference=p_trip and kind='upload') then raise exception 'PLAN_SOURCE'; end if;
    if s->>'type'='document' and not exists(select 1 from public.document_versions v join public.attachments a on a.id=v.document_id where a.id::text=s->>'documentId' and a.trip_reference=p_trip and v.revision=(s->>'revision')::integer) then raise exception 'PLAN_SOURCE'; end if;
  end loop;
  return true;
end;
$$;
create function public.planning_message(p_trip uuid,p_id text) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object('id',m.id,'conversationId',m.conversation_id,'role',m.role,'parts',m.parts) into result
    from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=p_id and c.trip_reference=p_trip;
  if result is null then raise exception 'PLAN_SOURCE'; end if;
  return result;
end;
$$;
create function public.planning_commit(p_trip uuid,p_operation text,p_generation uuid,p_expected bigint,p_plan jsonb,p_writes uuid[],p_sources jsonb,p_handled text[],p_summary text)
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
  if (p_plan is null and cardinality(p_writes)=0) or cardinality(p_writes)>8 or char_length(p_summary)>2000 then raise exception 'PLAN_INVALID'; end if;
  if exists(select 1 from unnest(p_handled) i where not exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=i and m.role='user' and c.trip_reference=p_trip)) then raise exception 'PLAN_SOURCE'; end if;
  -- Publish through module contracts.
  foreach w in array p_writes loop
    perform public.document_publish(p_trip,w);
    documents:=array_append(documents,(select document_id from public.document_writes where id=w));
  end loop;
  perform public.planning_sources(p_trip,p_sources);
  if p_plan is not null then perform public.plan_apply(p_trip,p_plan); end if;
  select environment_revision into revision from public.trips where reference=p_trip;
  insert into public.planning_commits(operation_id,trip_reference,revision,summary,document_ids,handled_inputs) values(p_operation,p_trip,revision,p_summary,documents,p_handled) returning * into receipt;
  return jsonb_build_object('receipt',to_jsonb(receipt),'snapshot',public.planning_snapshot(p_trip));
end;
$$;
create function public.planning_withdraw(p_trip uuid,p_operation text,p_message text) returns boolean language plpgsql set search_path='' as $$
begin
  perform public.planning_sources(p_trip,jsonb_build_array(jsonb_build_object('type','message','messageId',p_message,'conversationId',(select conversation_id from public.messages where id=p_message))));
  update public.planning_runs set withdrawn_by_message_id=p_message where id=p_operation and trip_reference=p_trip and not exists(select 1 from public.planning_commits where operation_id=p_operation);
  return found;
end;
$$;
revoke all on function public.planning_snapshot(uuid),public.planning_begin(uuid,uuid,text,uuid),public.planning_sources(uuid,jsonb),public.planning_message(uuid,text),public.planning_commit(uuid,text,uuid,bigint,jsonb,uuid[],jsonb,text[],text),public.planning_withdraw(uuid,text,text) from public,anon,authenticated;
grant execute on function public.planning_snapshot(uuid),public.planning_begin(uuid,uuid,text,uuid),public.planning_sources(uuid,jsonb),public.planning_message(uuid,text),public.planning_commit(uuid,text,uuid,bigint,jsonb,uuid[],jsonb,text[],text),public.planning_withdraw(uuid,text,text) to service_role;

create or replace function public.chat_begin_turn(p_trip uuid, p_conversation uuid, p_expected text, p_user_id text, p_text text, p_retry boolean, p_generation uuid, p_attachments uuid[] default '{}'::uuid[])
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_last public.messages;
  v_reply public.messages;
  v_count integer;
  v_size bigint;
  v_parts jsonb;
begin
  perform 1 from public.trips where reference = p_trip for update;
  perform 1 from public.conversations where id = p_conversation and trip_reference = p_trip for update;
  if not found then raise exception 'CHAT_NOT_FOUND'; end if;
  update public.messages set status = 'interrupted', generation_id = null, updated_at = now()
    where conversation_id = p_conversation and status = 'streaming' and updated_at < now() - interval '90 seconds';
  if exists(select 1 from public.messages where conversation_id = p_conversation and status = 'streaming') then
    raise exception 'CHAT_BUSY';
  end if;
  select * into v_last from public.messages where conversation_id = p_conversation order by position desc limit 1;
  if v_last.id is distinct from p_expected then raise exception 'CHAT_CONFLICT'; end if;
  if p_attachments is null or cardinality(p_attachments) > 3 or cardinality(p_attachments) <> (select count(distinct id) from unnest(p_attachments) id) then
    raise exception 'ATTACHMENT_INVALID';
  end if;
  if p_retry and cardinality(p_attachments) > 0 then raise exception 'ATTACHMENT_INVALID'; end if;
  if p_retry then
    if v_last.id is null or v_last.role <> 'assistant' then raise exception 'CHAT_CONFLICT'; end if;
    update public.messages set parts = '[]'::jsonb, status = 'streaming', generation_id = p_generation, updated_at = now()
      where id = v_last.id returning * into v_reply;
  else
    if p_user_id is null or p_user_id !~ '^[a-zA-Z0-9_-]{1,100}$' or p_text is null or char_length(btrim(p_text)) not between 1 and 4000 then
      raise exception 'CHAT_INVALID';
    end if;
    if exists(select 1 from public.messages where id = p_user_id) then raise exception 'CHAT_CONFLICT'; end if;
    select count(*), coalesce(sum(char_length(parts::text)), 0) into v_count, v_size from public.messages where conversation_id = p_conversation;
    if v_count >= 40 or v_size + char_length(p_text) > 40000 then raise exception 'CHAT_FULL'; end if;
    -- Bind verified files atomically.
    perform 1 from public.attachments where id = any(p_attachments) order by id for update;
    if (select count(*) from public.attachments where id = any(p_attachments) and trip_reference = p_trip and status = 'ready') <> cardinality(p_attachments) then
      raise exception 'ATTACHMENT_INVALID';
    end if;
    if (select count(*) from (select document_id from public.conversation_documents where conversation_id = p_conversation union select unnest(p_attachments)) selected) > 6 then
      raise exception 'ATTACHMENT_CHAT_FULL';
    end if;
    select jsonb_build_array(jsonb_build_object('type', 'text', 'text', p_text)) || coalesce(jsonb_agg(
      jsonb_build_object('type', 'data-attachment', 'data', jsonb_build_object('id', a.id, 'name', a.name, 'mediaType', a."mediaType", 'size', a.size)) order by array_position(p_attachments, a.id)), '[]'::jsonb)
      into v_parts from public.attachments a where a.id = any(p_attachments);
    insert into public.messages(id, conversation_id, role, parts, status)
      values (p_user_id, p_conversation, 'user', v_parts, 'complete');
    insert into public.message_documents(message_id, document_id) select p_user_id, unnest(p_attachments);
    insert into public.conversation_documents(conversation_id, document_id) select p_conversation, unnest(p_attachments) on conflict do nothing;
    insert into public.messages(id, conversation_id, role, status, generation_id)
      values (gen_random_uuid()::text, p_conversation, 'assistant', 'streaming', p_generation) returning * into v_reply;
  end if;
  update public.conversations set updated_at = now() where id = p_conversation;
  return jsonb_build_object('responseId', v_reply.id, 'documents', (
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'mediaType', a."mediaType", 'size', a.size) order by a.created_at, a.id), '[]'::jsonb)
    from public.conversation_documents d join public.attachments a on a.id = d.document_id
    where d.conversation_id = p_conversation and a.trip_reference = p_trip and a.status = 'ready'
  ), 'messages', (
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'conversationId', m.conversation_id, 'role', m.role, 'content', (
      select string_agg(part->>'text', '' order by ordinal) from jsonb_array_elements(m.parts) with ordinality as p(part, ordinal) where part->>'type' = 'text'
    ), 'attachments', (select coalesce(jsonb_agg(part->'data' order by ordinal), '[]'::jsonb) from jsonb_array_elements(m.parts) with ordinality as p(part, ordinal) where part->>'type' = 'data-attachment')) order by m.position), '[]'::jsonb)
    from public.messages m where m.conversation_id = p_conversation and m.id <> v_reply.id and jsonb_array_length(m.parts) > 0
  ));
end;
$$;




-- Preserve save receipts even if the final provider reply fails.
create function public.planning_reply_receipt() returns trigger language plpgsql set search_path='' as $$
declare receipt public.planning_commits;
begin
  if new.role='assistant' then
    select * into receipt from public.planning_commits where operation_id=new.id;
    if found then
      new.parts:=(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(new.parts) where value->>'type'<>'data-commit') || jsonb_build_array(jsonb_build_object('type','data-commit','data',jsonb_build_object('summary',receipt.summary,'revision',receipt.revision)));
    end if;
  end if;
  return new;
end;
$$;
create trigger planning_reply_receipt before update on public.messages for each row execute function public.planning_reply_receipt();
revoke all on function public.planning_reply_receipt() from public,anon,authenticated;

-- Validate cross-module references on every Plan writer.
create function public.plan_source_guard() returns trigger language plpgsql set search_path='' as $$
declare refs jsonb; basis jsonb; s jsonb;
begin
  select coalesce(jsonb_agg(value),'[]'::jsonb) into refs from jsonb_path_query(new.content,'$.**.sources[*]') as q(value);
  perform public.planning_sources(new.trip_reference,refs);
  for basis in select value from jsonb_path_query(new.content,'$.** ? (@.kind == "user")') as q(value) loop
    for s in select value from jsonb_array_elements(coalesce(basis->'sources','[]'::jsonb)) loop
      if s->>'type'='document' and not exists(select 1 from public.document_versions where document_id::text=s->>'documentId' and revision=(s->>'revision')::integer and author='user') then raise exception 'PLAN_SOURCE'; end if;
    end loop;
  end loop;
  return new;
end;
$$;
create trigger plan_sources before insert or update on public.plans for each row execute function public.plan_source_guard();
revoke all on function public.plan_source_guard() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
