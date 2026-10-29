begin;

-- Preserve existing originals.
alter table public.attachments drop constraint attachments_status_check;
alter table public.attachments add constraint attachments_status_check check (status in ('pending', 'ready', 'deleting', 'deleted'));
alter table public.attachments drop constraint attachments_source_check;
alter table public.attachments add constraint attachments_source_check check (source in ('chat', 'starter', 'library'));
alter table public.attachments add column original_name text;
update public.attachments set original_name = name;
alter table public.attachments alter column original_name set not null;
alter table public.attachments add column revision integer not null default 1;
alter table public.attachments add column updated_at timestamptz not null default now();
alter table public.attachments add column last_activity_at timestamptz not null default now();
-- Existing grants may still be usable when this migration runs.
alter table public.attachments add column signed_until timestamptz not null default (now() + interval '125 minutes');
alter table public.attachments add column cleanup_at timestamptz;
alter table public.attachments drop constraint attachments_trip_reference_fkey;
alter table public.attachments add constraint attachments_trip_reference_fkey foreign key (trip_reference) references public.trips(reference) on delete restrict;

create table public.message_documents (
  message_id text not null references public.messages(id) on delete cascade,
  document_id uuid not null references public.attachments(id) on delete restrict,
  primary key (message_id, document_id)
);
create index message_documents_document on public.message_documents(document_id);
create table public.conversation_documents (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  document_id uuid not null references public.attachments(id) on delete restrict,
  primary key (conversation_id, document_id)
);
insert into public.message_documents(message_id, document_id)
  select message_id, id from public.attachments where message_id is not null;
insert into public.conversation_documents(conversation_id, document_id)
  select m.conversation_id, a.id from public.attachments a join public.messages m on m.id = a.message_id;
alter table public.attachments drop column message_id;
alter table public.message_documents enable row level security;
alter table public.conversation_documents enable row level security;
revoke all on public.message_documents, public.conversation_documents from anon, authenticated;
grant select, insert, update, delete on public.message_documents, public.conversation_documents to service_role;
create index documents_cleanup on public.attachments(cleanup_at) where status = 'deleting';

-- Read scoped metadata.
create function public.document_record(p_trip uuid, p_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare v_record public.attachments;
begin
  select * into v_record from public.attachments where trip_reference = p_trip and id = p_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  return to_jsonb(v_record);
end;
$$;
create function public.document_list(p_trip uuid, p_id uuid default null)
returns jsonb language sql set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'mediaType', a."mediaType", 'size', a.size,
    'originalName', a.original_name, 'status', a.status, 'createdAt', a.created_at,
    'updatedAt', a.updated_at, 'revision', a.revision,
    'usages', (select coalesce(jsonb_agg(jsonb_build_object('messageId', m.id, 'conversationId', m.conversation_id) order by m.position), '[]'::jsonb)
      from public.message_documents r join public.messages m on m.id = r.message_id where r.document_id = a.id)
  ) order by a.created_at desc, a.id), '[]'::jsonb)
  from public.attachments a where a.trip_reference = p_trip and (case when p_id is null then a.status <> 'deleted' else a.id = p_id end);
$$;

-- Reserve bounded uploads.
create or replace function public.attachment_reserve(p_trip uuid, p_id uuid, p_name text, p_type text, p_size integer, p_source text)
returns jsonb language plpgsql set search_path = '' as $$
declare v_record public.attachments;
begin
  perform 1 from public.trips where reference = p_trip for update;
  if not found then raise exception 'CHAT_NOT_FOUND'; end if;
  select * into v_record from public.attachments where id = p_id for update;
  if found then
    if v_record.trip_reference <> p_trip or v_record.original_name <> p_name or v_record."mediaType" <> p_type or v_record.size <> p_size or v_record.status in ('deleting', 'deleted') then
      raise exception 'ATTACHMENT_CONFLICT';
    end if;
    if v_record.status = 'pending' then
      update public.attachments set last_activity_at = now(), signed_until = greatest(signed_until, now() + interval '125 minutes') where id = p_id returning * into v_record;
    end if;
    return to_jsonb(v_record);
  end if;
  if (select count(*) from public.attachments where trip_reference = p_trip and status <> 'deleted') >= 30 then raise exception 'ATTACHMENT_LIMIT'; end if;
  insert into public.attachments(id, trip_reference, name, original_name, "mediaType", size, path, source)
    values (p_id, p_trip, p_name, p_name, p_type, p_size, p_trip::text || '/' || p_id::text, p_source) returning * into v_record;
  return to_jsonb(v_record);
end;
$$;

-- Serialize lifecycle changes.
create function public.document_mutate(p_trip uuid, p_id uuid, p_action text, p_revision integer default null, p_name text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare v_record public.attachments;
begin
  perform 1 from public.trips where reference = p_trip for update;
  select * into v_record from public.attachments where trip_reference = p_trip and id = p_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if p_action = 'delete' and v_record.status in ('deleting', 'deleted') then return to_jsonb(v_record); end if;
  if p_action in ('rename', 'delete') and (p_revision is null or p_revision <> v_record.revision) then raise exception 'DOCUMENT_CONFLICT'; end if;
  if p_action = 'finalize' then
    if v_record.status not in ('pending', 'ready') then raise exception 'DOCUMENT_GONE'; end if;
    if v_record.status = 'pending' then
      update public.attachments set status = 'ready', revision = revision + 1, updated_at = now(), last_activity_at = now() where id = p_id returning * into v_record;
    end if;
  elsif p_action = 'rename' then
    if v_record.status not in ('pending', 'ready') then raise exception 'DOCUMENT_GONE'; end if;
    if p_name is null or char_length(btrim(p_name)) not between 1 and 180 or p_name ~ '[[:cntrl:]]' then raise exception 'DOCUMENT_INVALID'; end if;
    update public.attachments set name = p_name, revision = revision + 1, updated_at = now() where id = p_id returning * into v_record;
  elsif p_action = 'delete' then
    update public.attachments set status = 'deleting', revision = revision + 1, updated_at = now(), cleanup_at = now() where id = p_id returning * into v_record;
    delete from public.conversation_documents where document_id = p_id;
  elsif p_action = 'purged' then
    if v_record.status = 'deleted' then return to_jsonb(v_record); end if;
    if v_record.status <> 'deleting' then raise exception 'DOCUMENT_CONFLICT'; end if;
    if v_record.signed_until <= now() then
      update public.attachments set status = 'deleted', name = 'Deleted document', original_name = 'Deleted document', revision = revision + 1, updated_at = now(), cleanup_at = null where id = p_id returning * into v_record;
    else
      update public.attachments set cleanup_at = signed_until where id = p_id returning * into v_record;
    end if;
  else raise exception 'DOCUMENT_INVALID'; end if;
  return to_jsonb(v_record);
end;
$$;

-- Claim bounded cleanup work.
create function public.document_cleanup_batch(p_limit integer default 10)
returns jsonb language plpgsql set search_path = '' as $$
declare v_candidate record; v_record public.attachments; v_result jsonb := '[]'::jsonb;
begin
  for v_candidate in select * from (select id, trip_reference from public.attachments
    where (status = 'pending' and last_activity_at < now() - interval '24 hours') or (status = 'deleting' and cleanup_at <= now())
    order by coalesce(cleanup_at, last_activity_at), id limit least(greatest(p_limit, 1), 10)) due
    order by trip_reference, id
  loop
    -- Match mutation lock order.
    perform 1 from public.trips where reference = v_candidate.trip_reference for update;
    select * into v_record from public.attachments where id = v_candidate.id for update;
    if (v_record.status = 'pending' and v_record.last_activity_at < now() - interval '24 hours') or (v_record.status = 'deleting' and v_record.cleanup_at <= now()) then
      update public.attachments set status = 'deleting', cleanup_at = now() + interval '5 minutes', revision = revision + case when status = 'pending' then 1 else 0 end,
        updated_at = case when status = 'pending' then now() else updated_at end where id = v_record.id returning * into v_record;
      v_result := v_result || jsonb_build_array(to_jsonb(v_record));
    end if;
  end loop;
  return v_result;
end;
$$;

-- Keep selected context bounded.
create function public.chat_document_remove(p_trip uuid, p_conversation uuid, p_document uuid)
returns jsonb language plpgsql set search_path = '' as $$
begin
  perform 1 from public.trips where reference = p_trip for update;
  perform 1 from public.conversations where id = p_conversation and trip_reference = p_trip for update;
  if not found then raise exception 'CHAT_NOT_FOUND'; end if;
  if exists(select 1 from public.messages where conversation_id = p_conversation and status = 'streaming' and updated_at >= now() - interval '90 seconds') then raise exception 'CHAT_BUSY'; end if;
  if not exists(select 1 from public.attachments where id = p_document and trip_reference = p_trip) then raise exception 'ATTACHMENT_INVALID'; end if;
  delete from public.conversation_documents where conversation_id = p_conversation and document_id = p_document;
  return '{}'::jsonb;
end;
$$;

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
    select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'content', (
      select string_agg(part->>'text', '' order by ordinal) from jsonb_array_elements(m.parts) with ordinality as p(part, ordinal) where part->>'type' = 'text'
    ), 'attachments', (select coalesce(jsonb_agg(part->'data' order by ordinal), '[]'::jsonb) from jsonb_array_elements(m.parts) with ordinality as p(part, ordinal) where part->>'type' = 'data-attachment')) order by m.position), '[]'::jsonb)
    from public.messages m where m.conversation_id = p_conversation and m.id <> v_reply.id and jsonb_array_length(m.parts) > 0
  ));
end;
$$;


create or replace function public.chat_snapshot(p_trip uuid, p_conversation uuid default null, p_new uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_conversation public.conversations;
  v_conversations jsonb;
  v_messages jsonb;
begin
  perform 1 from public.trips where reference = p_trip for update;
  if not found then raise exception 'CHAT_NOT_FOUND'; end if;
  if p_new is not null then
    insert into public.conversations(id, trip_reference) values (p_new, p_trip) on conflict (id) do nothing;
    p_conversation := p_new;
  end if;
  if p_conversation is null then
    select * into v_conversation from public.conversations where trip_reference = p_trip order by created_at desc, id desc limit 1;
    if not found then
      insert into public.conversations(trip_reference) values (p_trip) returning * into v_conversation;
    end if;
  else
    select * into v_conversation from public.conversations where id = p_conversation and trip_reference = p_trip;
    if not found then raise exception 'CHAT_NOT_FOUND'; end if;
  end if;

  -- Recover abandoned replies.
  update public.messages set status = 'interrupted', generation_id = null, updated_at = now()
    where conversation_id = v_conversation.id and status = 'streaming' and updated_at < now() - interval '90 seconds';
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'parts', m.parts,
    'metadata', jsonb_build_object('status', m.status, 'createdAt', m.created_at)) order by m.position), '[]'::jsonb)
    into v_messages from public.messages m where m.conversation_id = v_conversation.id;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'createdAt', c.created_at) order by c.created_at desc, c.id desc), '[]'::jsonb)
    into v_conversations from public.conversations c where c.trip_reference = p_trip;
  return jsonb_build_object('conversationId', v_conversation.id, 'conversations', v_conversations, 'messages', v_messages, 'documents', (
    select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'mediaType', a."mediaType", 'size', a.size) order by a.created_at, a.id), '[]'::jsonb)
    from public.conversation_documents d join public.attachments a on a.id = d.document_id
    where d.conversation_id = v_conversation.id and a.trip_reference = p_trip and a.status = 'ready'
  ));
end;
$$;


revoke all on function public.document_record(uuid, uuid), public.document_list(uuid, uuid), public.document_mutate(uuid, uuid, text, integer, text), public.document_cleanup_batch(integer), public.chat_document_remove(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.document_record(uuid, uuid), public.document_list(uuid, uuid), public.document_mutate(uuid, uuid, text, integer, text), public.document_cleanup_batch(integer), public.chat_document_remove(uuid, uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
