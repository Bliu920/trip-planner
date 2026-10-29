begin;

-- Extend guarded planning lifetime.
create or replace function public.planning_begin(p_trip uuid,p_conversation uuid,p_reply text,p_generation uuid) returns jsonb language plpgsql set search_path='' as $$
declare input text;
begin
  perform 1 from public.trips where reference=p_trip for update;
  perform 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=p_reply and m.conversation_id=p_conversation and c.trip_reference=p_trip and m.status='streaming' and m.generation_id=p_generation for update of m;
  if not found then raise exception 'PLAN_ATTEMPT'; end if;
  select id into input from public.messages where conversation_id=p_conversation and role='user' order by position desc limit 1;
  insert into public.planning_runs(id,trip_reference,conversation_id,input_id,deadline) values(p_reply,p_trip,p_conversation,input,now()+interval '600 seconds')
    on conflict(id) do update set deadline=excluded.deadline;
  update public.trips set planning_started=true where reference=p_trip;
  return jsonb_build_object('snapshot',public.planning_snapshot(p_trip),'inputId',input,'receipt',(select to_jsonb(c) from public.planning_commits c where operation_id=p_reply and trip_reference=p_trip));
end;
$$;

-- Save terminal diagnostics atomically.
create function public.chat_write_reply_result(p_trip uuid, p_conversation uuid, p_message text, p_generation uuid, p_text text, p_status text, p_failure jsonb)
returns boolean language plpgsql set search_path='' as $$
begin
  if p_status not in ('failed','interrupted') or p_failure is null
    or jsonb_typeof(p_failure)<>'object' or char_length(p_failure::text)>1000
    or coalesce(p_failure->>'code','') not in ('timeout','step_limit','output_limit','provider_limit','provider_error','storage_error','cancelled','incomplete','empty_reply','connection_lost')
    or jsonb_typeof(p_failure->'steps') is distinct from 'number'
    or jsonb_typeof(p_failure->'elapsedMs') is distinct from 'number'
    or (p_failure->>'steps')::numeric < 0 or (p_failure->>'elapsedMs')::numeric < 0 then
    raise exception 'CHAT_INVALID';
  end if;
  if not public.chat_write_reply(p_trip,p_conversation,p_message,p_generation,p_text,p_status) then return false; end if;
  update public.messages set parts=(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(parts) where value->>'type'<>'data-failure')
    || jsonb_build_array(jsonb_build_object('type','data-failure','data',p_failure)) where id=p_message;
  return true;
end;
$$;
revoke all on function public.chat_write_reply_result(uuid,uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.chat_write_reply_result(uuid,uuid,text,uuid,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
