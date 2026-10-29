begin;

-- Preserve references in existing message parts.
-- This wrapper retains the original turn locking, document checks and retries.
create function public.chat_begin_turn_places(
  p_trip uuid, p_conversation uuid, p_expected text, p_user_id text,
  p_text text, p_retry boolean, p_generation uuid,
  p_attachments uuid[] default '{}'::uuid[], p_places text[] default '{}'::text[]
) returns jsonb language plpgsql set search_path = '' as $$
declare
  result jsonb;
  refs jsonb;
begin
  if p_places is null or cardinality(p_places) > 103
    or cardinality(p_places) <> (select count(distinct id) from unnest(p_places) id)
    or exists(select 1 from unnest(p_places) as selected(id) where not exists(select 1 from public.places p where p.id = selected.id))
    or (p_retry and cardinality(p_places) > 0) then
    raise exception 'PLACE_REFERENCE_INVALID';
  end if;

  result := public.chat_begin_turn(p_trip, p_conversation, p_expected, p_user_id, p_text, p_retry, p_generation, p_attachments);
  if not p_retry and cardinality(p_places) > 0 then
    select jsonb_agg(jsonb_build_object('type', 'data-place', 'data', jsonb_build_object('id', id)) order by ordinal)
      into refs from unnest(p_places) with ordinality as selected(id, ordinal);
    update public.messages set parts = parts || refs where id = p_user_id and conversation_id = p_conversation and role = 'user';
    if (select coalesce(sum(char_length(parts::text)), 0) from public.messages where conversation_id = p_conversation) > 40000 then
      raise exception 'CHAT_FULL';
    end if;
  end if;

  -- Rebuild only reference projections.
  return jsonb_set(result, '{messages}', (
    select coalesce(jsonb_agg(message || jsonb_build_object('placeIds', (
      select coalesce(jsonb_agg(part->'data'->>'id' order by p.position), '[]'::jsonb)
      from public.messages m cross join lateral jsonb_array_elements(m.parts) with ordinality as p(part, position)
      where m.id = message->>'id' and m.conversation_id = p_conversation and part->>'type' = 'data-place'
    )) order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(result->'messages') with ordinality as history(message, ordinal)
  ));
end;
$$;
revoke all on function public.chat_begin_turn_places(uuid, uuid, text, text, text, boolean, uuid, uuid[], text[]) from public, anon, authenticated;
grant execute on function public.chat_begin_turn_places(uuid, uuid, text, text, text, boolean, uuid, uuid[], text[]) to service_role;
notify pgrst, 'reload schema';

commit;
