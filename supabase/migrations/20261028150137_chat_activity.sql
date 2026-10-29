begin;

-- Activity is message history, separate from text checkpoints and model context.
create table public.message_activity (
  message_id text not null references public.messages(id) on delete cascade,
  id text not null,
  generation_id uuid not null,
  position bigint generated always as identity,
  entry jsonb not null check (jsonb_typeof(entry) = 'object' and octet_length(entry::text) <= 40000),
  primary key (message_id, id)
);
create index message_activity_order on public.message_activity(message_id, position);
alter table public.message_activity enable row level security;
revoke all on public.message_activity from public, anon, authenticated;
grant select, insert, update on public.message_activity to service_role;
grant usage, select on sequence public.message_activity_position_seq to service_role;

create function public.chat_record_activity(p_trip uuid, p_conversation uuid, p_message text, p_generation uuid, p_entry jsonb)
returns boolean language plpgsql set search_path = '' as $$
declare previous jsonb;
begin
  if jsonb_typeof(p_entry) is distinct from 'object'
    or p_entry->>'attempt' is distinct from p_generation::text
    or coalesce(p_entry->>'id', '') not like p_generation::text || ':%'
    or char_length(p_entry->>'id') not between 1 and 240
    or coalesce(p_entry->>'status', '') not in ('running','complete','prepared','failed','unconfirmed','interrupted')
    or char_length(coalesce(p_entry->>'title','')) not between 1 and 160
    or char_length(coalesce(p_entry->>'detail','')) > 1200
    or jsonb_typeof(p_entry->'sources') is distinct from 'array'
    or jsonb_typeof(p_entry->'documents') is distinct from 'array'
    or octet_length(p_entry::text) > 40000 then raise exception 'CHAT_INVALID'; end if;
  if jsonb_array_length(p_entry->'sources') > 12 or jsonb_array_length(p_entry->'documents') > 30 then raise exception 'CHAT_INVALID'; end if;
  -- Serialize with completion and retry.
  perform 1 from public.messages m where m.id=p_message and m.conversation_id=p_conversation
    and m.role='assistant' and m.status='streaming' and m.generation_id=p_generation
    and exists(select 1 from public.conversations c where c.id=m.conversation_id and c.trip_reference=p_trip) for update;
  if not found then return false; end if;
  select entry into previous from public.message_activity where message_id=p_message and id=p_entry->>'id';
  if previous is not null and previous->>'status'<>'running' then return previous=p_entry; end if;
  if previous is null and (select count(*) from public.message_activity where message_id=p_message) >= 600 then raise exception 'CHAT_FULL'; end if;
  insert into public.message_activity(message_id,id,generation_id,entry) values(p_message,p_entry->>'id',p_generation,p_entry)
    on conflict(message_id,id) do update set entry=excluded.entry;
  return true;
end;
$$;

-- Abandoned work and earlier attempts never keep a permanent spinner.
create function public.chat_finish_activity() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.role='assistant' and old.generation_id is not null
    and (new.status<>'streaming' or new.generation_id is distinct from old.generation_id) then
    update public.message_activity set entry=entry || jsonb_build_object('status','interrupted','detail','This step ended without a confirmed result.')
      where message_id=old.id and generation_id=old.generation_id and entry->>'status'='running';
  end if;
  return new;
end;
$$;
create trigger chat_finish_activity after update of status, generation_id on public.messages for each row execute function public.chat_finish_activity();

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
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'parts', m.parts || coalesce((select jsonb_agg(jsonb_build_object('type','data-activity','id',a.id,'data',a.entry) order by a.position) from public.message_activity a where a.message_id=m.id), '[]'::jsonb),
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

revoke all on function public.chat_record_activity(uuid,uuid,text,uuid,jsonb), public.chat_finish_activity() from public,anon,authenticated;
grant execute on function public.chat_record_activity(uuid,uuid,text,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
