begin;

-- Keep originals private.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('trip-attachments', 'trip-attachments', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png']);

create table public.attachments (
  id uuid primary key,
  trip_reference uuid not null references public.trips(reference) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  "mediaType" text not null check ("mediaType" in ('application/pdf', 'image/jpeg', 'image/png')),
  size integer not null check (size between 1 and 5242880),
  path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'ready')),
  source text not null check (source in ('chat', 'starter')),
  message_id text references public.messages(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index attachments_trip on public.attachments(trip_reference, created_at);
create index attachments_message on public.attachments(message_id);
alter table public.attachments enable row level security;
revoke all on public.attachments from anon, authenticated;
grant select, insert, update on public.attachments to service_role;

-- Reserve idempotent uploads.
create function public.attachment_reserve(p_trip uuid, p_id uuid, p_name text, p_type text, p_size integer, p_source text)
returns jsonb language plpgsql set search_path = '' as $$
declare v_record public.attachments;
begin
  perform 1 from public.trips where reference = p_trip for update;
  if not found then raise exception 'CHAT_NOT_FOUND'; end if;
  select * into v_record from public.attachments where id = p_id;
  if found then
    if v_record.trip_reference <> p_trip or v_record.name <> p_name or v_record."mediaType" <> p_type or v_record.size <> p_size or v_record.source <> p_source or v_record.message_id is not null then
      raise exception 'ATTACHMENT_CONFLICT';
    end if;
    return to_jsonb(v_record);
  end if;
  if (select count(*) from public.attachments where trip_reference = p_trip) >= 30 then raise exception 'ATTACHMENT_LIMIT'; end if;
  insert into public.attachments(id, trip_reference, name, "mediaType", size, path, source)
    values (p_id, p_trip, p_name, p_type, p_size, p_trip::text || '/' || p_id::text, p_source) returning * into v_record;
  return to_jsonb(v_record);
end;
$$;
revoke all on function public.attachment_reserve(uuid, uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.attachment_reserve(uuid, uuid, text, text, integer, text) to service_role;

drop function public.chat_begin_turn(uuid, uuid, text, text, text, boolean, uuid);
create function public.chat_begin_turn(p_trip uuid, p_conversation uuid, p_expected text, p_user_id text, p_text text, p_retry boolean, p_generation uuid, p_attachments uuid[] default '{}'::uuid[])
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_last public.messages;
  v_reply public.messages;
  v_count integer;
  v_size bigint;
  v_parts jsonb;
begin
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
    if (select count(*) from public.attachments where id = any(p_attachments) and trip_reference = p_trip and status = 'ready' and message_id is null) <> cardinality(p_attachments) then
      raise exception 'ATTACHMENT_INVALID';
    end if;
    if (select count(*) from public.attachments a join public.messages m on m.id = a.message_id where m.conversation_id = p_conversation) + cardinality(p_attachments) > 6 then
      raise exception 'ATTACHMENT_CHAT_FULL';
    end if;
    select jsonb_build_array(jsonb_build_object('type', 'text', 'text', p_text)) || coalesce(jsonb_agg(
      jsonb_build_object('type', 'data-attachment', 'data', jsonb_build_object('id', a.id, 'name', a.name, 'mediaType', a."mediaType", 'size', a.size)) order by array_position(p_attachments, a.id)), '[]'::jsonb)
      into v_parts from public.attachments a where a.id = any(p_attachments);
    insert into public.messages(id, conversation_id, role, parts, status)
      values (p_user_id, p_conversation, 'user', v_parts, 'complete');
    update public.attachments set message_id = p_user_id where id = any(p_attachments);
    insert into public.messages(id, conversation_id, role, status, generation_id)
      values (gen_random_uuid()::text, p_conversation, 'assistant', 'streaming', p_generation) returning * into v_reply;
  end if;
  update public.conversations set updated_at = now() where id = p_conversation;
  return jsonb_build_object('responseId', v_reply.id, 'messages', (
    select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'content', (
      select string_agg(part->>'text', '' order by ordinal) from jsonb_array_elements(m.parts) with ordinality as p(part, ordinal) where part->>'type' = 'text'
    ), 'attachments', (select coalesce(jsonb_agg(part->'data' order by ordinal), '[]'::jsonb) from jsonb_array_elements(m.parts) with ordinality as p(part, ordinal) where part->>'type' = 'data-attachment')) order by m.position), '[]'::jsonb)
    from public.messages m where m.conversation_id = p_conversation and m.id <> v_reply.id and jsonb_array_length(m.parts) > 0
  ));
end;
$$;

revoke all on function public.chat_begin_turn(uuid, uuid, text, text, text, boolean, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.chat_begin_turn(uuid, uuid, text, text, text, boolean, uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
commit;
