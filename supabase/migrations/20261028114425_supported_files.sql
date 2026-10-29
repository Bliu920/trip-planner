begin;

-- Generated from lib/file-types/formats.json. Do not hand-edit.
create or replace function public.library_file_types()
returns jsonb language sql immutable set search_path = '' as $policy$
  select '[{"id":"markdown","label":"Markdown","mime":"text/markdown","aliases":["text/x-markdown","text/plain"],"extensions":[".md",".markdown"],"maxBytes":262144,"minBytes":0,"editor":"text","preview":"text","ai":"text","create":true},{"id":"text","label":"Text","mime":"text/plain","aliases":[],"extensions":[".txt"],"maxBytes":262144,"minBytes":0,"editor":"text","preview":"text","ai":"text","create":true},{"id":"csv","label":"CSV","mime":"text/csv","aliases":["application/csv","text/plain","application/vnd.ms-excel"],"extensions":[".csv"],"maxBytes":262144,"minBytes":0,"editor":"text","preview":"text","ai":"text","create":true},{"id":"pdf","label":"PDF","mime":"application/pdf","aliases":[],"extensions":[".pdf"],"maxBytes":5242880,"minBytes":1,"editor":"none","preview":"pdf","ai":"file","create":false},{"id":"png","label":"PNG","mime":"image/png","aliases":[],"extensions":[".png"],"maxBytes":5242880,"minBytes":1,"editor":"none","preview":"image","ai":"file","create":false},{"id":"jpeg","label":"JPEG","mime":"image/jpeg","aliases":["image/jpg"],"extensions":[".jpg",".jpeg"],"maxBytes":5242880,"minBytes":1,"editor":"none","preview":"image","ai":"file","create":false}]'::jsonb;
$policy$;

create function public.library_file_type(p_type text)
returns jsonb language sql immutable set search_path = '' as $$
  select f from jsonb_array_elements(public.library_file_types()) f where f->>'mime'=p_type;
$$;
create function public.library_filename_type(p_name text)
returns jsonb language sql immutable set search_path = '' as $$
  select f from jsonb_array_elements(public.library_file_types()) f,
    jsonb_array_elements_text(f->'extensions') ext
  where lower(btrim(p_name)) like '%'||ext limit 1;
$$;
create function public.library_name_valid(p_name text,p_type text)
returns boolean language sql immutable set search_path = '' as $$
  select char_length(btrim(p_name)) between 1 and 180 and p_name !~ '[[:cntrl:]]'
    and (btrim(p_name) !~ '\.[^.[:space:]/\\]+$' or coalesce(public.library_filename_type(p_name)->>'mime'=p_type,false));
$$;

-- Enforce registry limits.
alter table public.attachments drop constraint "attachments_mediaType_check";
alter table public.attachments drop constraint attachments_size_check;
alter table public.attachments add constraint attachments_supported_file_check check (
  public.library_file_type("mediaType") is not null
  and size between (public.library_file_type("mediaType")->>'minBytes')::integer and (public.library_file_type("mediaType")->>'maxBytes')::integer
);
update storage.buckets set
  allowed_mime_types = array(select f->>'mime' from jsonb_array_elements(public.library_file_types()) f),
  file_size_limit = (select max((f->>'maxBytes')::integer) from jsonb_array_elements(public.library_file_types()) f)
where id='trip-attachments';
alter table public.document_writes add column "mediaType" text not null default 'text/markdown';

-- Preserve format on rename.
create function public.library_validate_name() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op='UPDATE' and new."mediaType"<>old."mediaType" then raise exception 'DOCUMENT_INVALID'; end if;
  if not public.library_name_valid(new.name,new."mediaType") then raise exception 'DOCUMENT_INVALID'; end if;
  return new;
end;
$$;
create trigger library_file_name before insert or update of name,"mediaType" on public.attachments for each row execute function public.library_validate_name();

create or replace function public.attachment_reserve(p_trip uuid, p_id uuid, p_name text, p_type text, p_size integer, p_source text)
returns jsonb language plpgsql set search_path = '' as $$
declare v_record public.attachments;
begin
  perform 1 from public.trips where reference = p_trip for update;
  if not found then raise exception 'CHAT_NOT_FOUND'; end if;
  if public.library_filename_type(p_name) is null or public.library_filename_type(p_name)->>'mime'<>p_type
    or not public.library_name_valid(p_name,p_type) then raise exception 'DOCUMENT_INVALID'; end if;
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


-- Version the verified original.
create function public.document_finalize_text(p_trip uuid,p_id uuid,p_hash text)
returns jsonb language plpgsql set search_path = '' as $$
declare a public.attachments;
begin
  perform 1 from public.trips where reference=p_trip for update;
  select * into a from public.attachments where id=p_id and trip_reference=p_trip for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if a.status not in ('pending','ready') then raise exception 'DOCUMENT_GONE'; end if;
  if a.status='ready' and a.content_revision>0 then return public.document_list(p_trip,p_id)->0; end if;
  if public.library_file_type(a."mediaType")->>'editor'<>'text' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'DOCUMENT_INVALID'; end if;
  insert into public.document_versions(document_id,revision,path,sha256,size,author) values(p_id,1,a.path,p_hash,a.size,'user');
  update public.attachments set content_revision=1 where id=p_id;
  perform public.document_mutate(p_trip,p_id,'finalize');
  return public.document_list(p_trip,p_id)->0;
end;
$$;

create or replace function public.document_stage(p_trip uuid, p_id uuid, p_write uuid, p_name text, p_kind text, p_expected integer, p_size integer, p_hash text, p_author text)
returns jsonb language plpgsql set search_path = '' as $$
declare a public.attachments; w public.document_writes; next_version integer; f jsonb; media_type text;
begin
  perform 1 from public.trips where reference=p_trip for update;
  if not found then raise exception 'CHAT_NOT_FOUND'; end if;
  if p_kind not in ('upload','planning_context','research','working') or p_author not in ('user','agent') or p_expected < 0 or char_length(btrim(p_name)) not between 1 and 180 or p_size < 0 or (p_kind='planning_context' and p_size>24576) or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'DOCUMENT_INVALID'; end if;
  select * into a from public.attachments where id=p_id;
  if found then
    if a.trip_reference<>p_trip then raise exception 'DOCUMENT_NOT_FOUND'; end if;
    if a.status<>'ready' then raise exception 'DOCUMENT_GONE'; end if;
    if a.revision<>p_expected or a.kind<>p_kind then raise exception 'DOCUMENT_CONFLICT'; end if;
    f:=public.library_file_type(a."mediaType");
    if a.content_revision<1 then raise exception 'DOCUMENT_INVALID'; end if;
    next_version:=a.content_revision+1;
  else
    if p_kind='upload' then raise exception 'DOCUMENT_INVALID'; end if;
    f:=public.library_filename_type(p_name);
    if f is null and btrim(p_name) !~ '\.[^.[:space:]/\\]+$' then f:=public.library_file_type('text/markdown'); end if;
    if p_expected<>0 then raise exception 'DOCUMENT_CONFLICT'; end if;
    if (select count(*) from public.attachments where trip_reference=p_trip and status<>'deleted') + (select count(distinct document_id) from public.document_writes where trip_reference=p_trip and not published and not discarded and expected_revision=0 and document_id<>p_id) >= 30 then raise exception 'ATTACHMENT_LIMIT'; end if;
    next_version:=1;
  end if;
  media_type:=f->>'mime';
  if f is null or not (f->>'create')::boolean or p_size>(f->>'maxBytes')::integer
    or not public.library_name_valid(p_name,media_type) or (p_kind='planning_context' and media_type<>'text/markdown') then raise exception 'DOCUMENT_INVALID'; end if;
  if p_kind='planning_context' and exists(select 1 from public.attachments where trip_reference=p_trip and kind=p_kind and status='ready' and id<>p_id) then raise exception 'DOCUMENT_CONFLICT'; end if;
  insert into public.document_writes(id,trip_reference,document_id,expected_revision,content_revision,name,kind,path,sha256,size,author,"mediaType")
    values(p_write,p_trip,p_id,p_expected,next_version,btrim(p_name),p_kind,p_trip::text||'/documents/'||p_id::text||'/'||p_write::text||(f->'extensions'->>0),p_hash,p_size,p_author,media_type) returning * into w;
  return to_jsonb(w);
end;
$$;

create or replace function public.document_publish(p_trip uuid,p_write uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare w public.document_writes; a public.attachments;
begin
  perform 1 from public.trips where reference=p_trip for update;
  select * into w from public.document_writes where id=p_write and trip_reference=p_trip for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if w.published then return public.document_list(p_trip,w.document_id)->0; end if;
  if not w.uploaded or w.discarded or public.library_file_type(w."mediaType")->>'editor'<>'text' then raise exception 'DOCUMENT_INVALID'; end if;
  select * into a from public.attachments where id=w.document_id for update;
  if found then
    if a.trip_reference<>p_trip or a.status<>'ready' or a.kind<>w.kind or a."mediaType"<>w."mediaType" or a.revision<>w.expected_revision then raise exception 'DOCUMENT_CONFLICT'; end if;
    update public.attachments set path=w.path, size=w.size, name=w.name, content_revision=w.content_revision, revision=revision+1, updated_at=now() where id=a.id;
  else
    if w.expected_revision<>0 then raise exception 'DOCUMENT_CONFLICT'; end if;
    if (select count(*) from public.attachments where trip_reference=p_trip and status<>'deleted')>=30 then raise exception 'ATTACHMENT_LIMIT'; end if;
    if w.kind='planning_context' and exists(select 1 from public.attachments where trip_reference=p_trip and kind=w.kind and status='ready') then raise exception 'DOCUMENT_CONFLICT'; end if;
    insert into public.attachments(id,trip_reference,name,original_name,"mediaType",size,path,status,source,revision,content_revision,kind,signed_until)
      values(w.document_id,p_trip,w.name,w.name,w."mediaType",w.size,w.path,'ready','library',1,w.content_revision,w.kind,now());
  end if;
  insert into public.document_versions(document_id,revision,path,sha256,size,author) values(w.document_id,w.content_revision,w.path,w.sha256,w.size,w.author);
  update public.document_writes set published=true where id=p_write;
  return public.document_list(p_trip,w.document_id)->0;
end;
$$;

revoke all on function public.library_file_types(),public.library_file_type(text),public.library_filename_type(text),public.library_name_valid(text,text),public.library_validate_name(),public.document_finalize_text(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.library_file_types(),public.library_file_type(text),public.library_filename_type(text),public.library_name_valid(text,text),public.library_validate_name(),public.document_finalize_text(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
