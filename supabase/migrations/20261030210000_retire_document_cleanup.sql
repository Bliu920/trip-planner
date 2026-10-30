begin;

-- Remove scheduled maintenance.
drop function if exists public.document_cleanup_batch(integer);
drop function if exists public.document_abandoned(uuid);
drop index if exists public.documents_cleanup;

-- Preserve manual deletion.
create or replace function public.document_mutate(p_trip uuid, p_id uuid, p_action text, p_revision integer default null, p_name text default null)
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
    update public.attachments set status = 'deleting', revision = revision + 1, updated_at = now() where id = p_id returning * into v_record;
    delete from public.conversation_documents where document_id = p_id;
  elsif p_action = 'purged' then
    if v_record.status = 'deleted' then return to_jsonb(v_record); end if;
    if v_record.status <> 'deleting' then raise exception 'DOCUMENT_CONFLICT'; end if;
    if v_record.signed_until <= now() then
      update public.attachments set status = 'deleted', name = 'Deleted document', original_name = 'Deleted document', revision = revision + 1, updated_at = now() where id = p_id returning * into v_record;
    end if;
  else raise exception 'DOCUMENT_INVALID'; end if;
  return to_jsonb(v_record);
end;
$$;

alter table public.attachments drop column cleanup_at;
alter table public.document_writes drop column cleaned;

notify pgrst, 'reload schema';
commit;
