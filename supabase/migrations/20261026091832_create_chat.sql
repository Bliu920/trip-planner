begin;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  trip_reference uuid not null references public.trips(reference) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_trip on public.conversations(trip_reference, created_at desc, id);

create table public.messages (
  id text primary key check (char_length(id) between 1 and 100),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  position bigint generated always as identity,
  role text not null check (role in ('user', 'assistant')),
  parts jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  status text not null check (status in ('streaming', 'complete', 'interrupted', 'failed')),
  generation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, position),
  check (role = 'assistant' or status = 'complete'),
  check ((status = 'streaming') = (generation_id is not null))
);
create index messages_conversation on public.messages(conversation_id, position);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
revoke all on public.conversations, public.messages from anon, authenticated;
grant select, insert, update on public.conversations, public.messages to service_role;
grant usage, select on sequence public.messages_position_seq to service_role;

-- Load or create conversations.
create function public.chat_snapshot(p_trip uuid, p_conversation uuid default null, p_new uuid default null)
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
  return jsonb_build_object('conversationId', v_conversation.id, 'conversations', v_conversations, 'messages', v_messages);
end;
$$;

-- Reserve one conversation turn.
create function public.chat_begin_turn(p_trip uuid, p_conversation uuid, p_expected text, p_user_id text, p_text text, p_retry boolean, p_generation uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_last public.messages;
  v_reply public.messages;
  v_count integer;
  v_size bigint;
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
    insert into public.messages(id, conversation_id, role, parts, status)
      values (p_user_id, p_conversation, 'user', jsonb_build_array(jsonb_build_object('type', 'text', 'text', p_text)), 'complete');
    insert into public.messages(id, conversation_id, role, status, generation_id)
      values (gen_random_uuid()::text, p_conversation, 'assistant', 'streaming', p_generation) returning * into v_reply;
  end if;
  update public.conversations set updated_at = now() where id = p_conversation;
  return jsonb_build_object('responseId', v_reply.id, 'messages', (
    select coalesce(jsonb_agg(jsonb_build_object('role', m.role, 'content', (
      select string_agg(part->>'text', '' order by ordinal) from jsonb_array_elements(m.parts) with ordinality as p(part, ordinal) where part->>'type' = 'text'
    )) order by m.position), '[]'::jsonb)
    from public.messages m where m.conversation_id = p_conversation and m.id <> v_reply.id and jsonb_array_length(m.parts) > 0
  ));
end;
$$;

-- Save guarded reply progress.
create function public.chat_write_reply(p_trip uuid, p_conversation uuid, p_message text, p_generation uuid, p_text text, p_status text)
returns boolean language plpgsql set search_path = '' as $$
declare v_updated integer;
begin
  if p_status not in ('streaming', 'complete', 'interrupted', 'failed') or p_text is null or char_length(p_text) > 16000 then
    raise exception 'CHAT_INVALID';
  end if;
  update public.messages m set parts = case when p_text = '' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('type', 'text', 'text', p_text)) end,
    status = p_status, generation_id = case when p_status = 'streaming' then p_generation else null end, updated_at = now()
    where m.id = p_message and m.conversation_id = p_conversation and m.role = 'assistant'
      and m.generation_id = p_generation and m.status = 'streaming'
      and exists(select 1 from public.conversations c where c.id = m.conversation_id and c.trip_reference = p_trip);
  get diagnostics v_updated = row_count;
  if v_updated > 0 then update public.conversations set updated_at = now() where id = p_conversation; end if;
  return v_updated > 0;
end;
$$;

revoke all on function public.chat_snapshot(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.chat_begin_turn(uuid, uuid, text, text, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.chat_write_reply(uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.chat_snapshot(uuid, uuid, uuid) to service_role;
grant execute on function public.chat_begin_turn(uuid, uuid, text, text, text, boolean, uuid) to service_role;
grant execute on function public.chat_write_reply(uuid, uuid, text, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
