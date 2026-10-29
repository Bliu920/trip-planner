begin;

-- Keep authoritative action state through text checkpoints and interruption.
create function public.planning_action_state() returns trigger language plpgsql set search_path='' as $$
declare state jsonb; receipt public.planning_commits;
begin
  if new.role<>'assistant' then return new; end if;
  select value into state from jsonb_array_elements(new.parts) where value->>'type'='data-action';
  if state is null then
    select value into state from jsonb_array_elements(old.parts) where value->>'type'='data-action';
  end if;
  select * into receipt from public.planning_commits where operation_id=new.id;
  if found then
    state:=jsonb_build_object('type','data-action','data',jsonb_build_object('state','saved','operationId',new.id,
      'message','Changes saved.','code','SAVED','revision',receipt.revision));
  end if;
  if state is not null then
    new.parts:=(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(new.parts) where value->>'type'<>'data-action') || jsonb_build_array(state);
  end if;
  return new;
end;
$$;
create trigger planning_action_state before update on public.messages for each row execute function public.planning_action_state();

create function public.planning_record_action(p_trip uuid,p_operation text,p_generation uuid,p_state jsonb)
returns boolean language plpgsql set search_path='' as $$
begin
  if jsonb_typeof(p_state)<>'object' or coalesce(p_state->>'state','') not in ('in_progress','saved','unsaved','unknown')
    or p_state->>'operationId' is distinct from p_operation or char_length(p_state::text)>6000 then raise exception 'PLAN_INVALID'; end if;
  if p_state->>'state'='saved' and not exists(select 1 from public.planning_commits where operation_id=p_operation and trip_reference=p_trip) then raise exception 'PLAN_INVALID'; end if;
  update public.messages m set parts=(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(m.parts) where value->>'type'<>'data-action')
    || jsonb_build_array(jsonb_build_object('type','data-action','data',p_state))
    where m.id=p_operation and m.role='assistant' and m.status='streaming' and m.generation_id=p_generation
      and exists(select 1 from public.conversations c where c.id=m.conversation_id and c.trip_reference=p_trip);
  return found;
end;
$$;

create function public.planning_run_result(p_trip uuid,p_operation text)
returns jsonb language plpgsql set search_path='' as $$
declare receipt public.planning_commits;
begin
  -- Serialize against publication.
  perform 1 from public.trips where reference=p_trip for update;
  if not exists(select 1 from public.planning_runs where id=p_operation and trip_reference=p_trip) then raise exception 'PLAN_NOT_FOUND'; end if;
  select * into receipt from public.planning_commits where operation_id=p_operation and trip_reference=p_trip;
  return jsonb_build_object('saved',receipt.operation_id is not null,'receipt',case when receipt.operation_id is null then null else to_jsonb(receipt) end,
    'snapshot',public.planning_snapshot(p_trip),
    'action',(select part->'data' from public.messages m cross join lateral jsonb_array_elements(m.parts) part where m.id=p_operation and part->>'type'='data-action' limit 1));
end;
$$;

revoke all on function public.planning_action_state(),public.planning_record_action(uuid,text,uuid,jsonb),public.planning_run_result(uuid,text) from public,anon,authenticated;
grant execute on function public.planning_record_action(uuid,text,uuid,jsonb),public.planning_run_result(uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
