begin;

-- Save context without completing a planning operation.
create function public.planning_save_brief(p_trip uuid,p_operation text,p_generation uuid,p_expected bigint,p_write uuid)
returns jsonb language plpgsql set search_path='' as $$
declare revision bigint; w public.document_writes;
begin
  select environment_revision into revision from public.trips where reference=p_trip for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  perform 1 from public.planning_runs r join public.messages m on m.id=r.id
    where r.id=p_operation and r.trip_reference=p_trip and r.deadline>now()
      and r.withdrawn_by_message_id is null and m.generation_id=p_generation and m.status='streaming'
    for update of m;
  if not found or exists(select 1 from public.planning_commits where operation_id=p_operation) then raise exception 'PLAN_ATTEMPT'; end if;
  select * into w from public.document_writes where id=p_write and trip_reference=p_trip for update;
  if not found or w.kind<>'planning_context' or w.author<>'agent' then raise exception 'PLAN_INVALID'; end if;
  -- Recover a lost response.
  if w.published then return public.planning_snapshot(p_trip); end if;
  if revision<>p_expected then raise exception 'PLAN_CONFLICT'; end if;
  perform public.document_publish(p_trip,p_write);
  return public.planning_snapshot(p_trip);
end;
$$;
revoke all on function public.planning_save_brief(uuid,text,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.planning_save_brief(uuid,text,uuid,bigint,uuid) to service_role;
notify pgrst,'reload schema';
commit;
