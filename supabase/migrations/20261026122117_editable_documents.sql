begin;

-- Extend the existing document owner.
alter table public.attachments add column kind text not null default 'upload' check (kind in ('upload','planning_context','research','working'));
alter table public.attachments add column content_revision integer not null default 0;
alter table public.attachments drop constraint "attachments_mediaType_check";
alter table public.attachments add constraint "attachments_mediaType_check" check ("mediaType" in ('application/pdf','image/jpeg','image/png','text/markdown'));
update storage.buckets set allowed_mime_types = array['application/pdf','image/jpeg','image/png','text/markdown'] where id = 'trip-attachments';
create unique index documents_one_context on public.attachments(trip_reference) where kind = 'planning_context' and status in ('pending','ready');

create table public.document_versions (
  document_id uuid not null references public.attachments(id) on delete restrict,
  revision integer not null check (revision > 0),
  path text not null unique, sha256 text not null, size integer not null,
  author text not null check (author in ('user','agent')),
  created_at timestamptz not null default now(),
  primary key(document_id, revision)
);
create table public.document_writes (
  id uuid primary key, trip_reference uuid not null references public.trips(reference) on delete restrict,
  document_id uuid not null, expected_revision integer not null, content_revision integer not null,
  name text not null, kind text not null, path text not null unique, sha256 text not null, size integer not null,
  author text not null check (author in ('user','agent')),
  uploaded boolean not null default false, published boolean not null default false,
  discarded boolean not null default false, cleaned boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.document_versions enable row level security;
alter table public.document_writes enable row level security;
revoke all on public.document_versions, public.document_writes from anon, authenticated;
grant select,insert,update,delete on public.document_versions, public.document_writes to service_role;

create or replace function public.document_list(p_trip uuid, p_id uuid default null)
returns jsonb language sql set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'mediaType', a."mediaType", 'size', a.size,
    'originalName', a.original_name, 'status', a.status, 'createdAt', a.created_at,
    'updatedAt', a.updated_at, 'revision', a.revision, 'kind', a.kind, 'contentRevision', a.content_revision,
    'usages', (select coalesce(jsonb_agg(jsonb_build_object('messageId', m.id, 'conversationId', m.conversation_id) order by m.position), '[]'::jsonb)
      from public.message_documents r join public.messages m on m.id = r.message_id where r.document_id = a.id)
  ) order by a.created_at desc, a.id), '[]'::jsonb)
  from public.attachments a where a.trip_reference = p_trip and (case when p_id is null then a.status <> 'deleted' else a.id = p_id end);
$$;

create function public.document_stage(p_trip uuid, p_id uuid, p_write uuid, p_name text, p_kind text, p_expected integer, p_size integer, p_hash text, p_author text)
returns jsonb language plpgsql set search_path = '' as $$
declare a public.attachments; w public.document_writes; next_version integer;
begin
  perform 1 from public.trips where reference=p_trip for update;
  if not found then raise exception 'CHAT_NOT_FOUND'; end if;
  if p_kind not in ('planning_context','research','working') or p_author not in ('user','agent') or p_expected < 0 or char_length(btrim(p_name)) not between 1 and 180 or p_size not between 1 and 262144 or (p_kind='planning_context' and p_size>24576) or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'DOCUMENT_INVALID'; end if;
  select * into a from public.attachments where id=p_id;
  if found then
    if a.trip_reference<>p_trip then raise exception 'DOCUMENT_NOT_FOUND'; end if;
    if a.status<>'ready' or a.kind='upload' then raise exception 'DOCUMENT_GONE'; end if;
    if a.revision<>p_expected or a.kind<>p_kind then raise exception 'DOCUMENT_CONFLICT'; end if;
    next_version:=a.content_revision+1;
  else
    if p_expected<>0 then raise exception 'DOCUMENT_CONFLICT'; end if;
    if (select count(*) from public.attachments where trip_reference=p_trip and status<>'deleted') + (select count(distinct document_id) from public.document_writes where trip_reference=p_trip and not published and not discarded and expected_revision=0 and document_id<>p_id) >= 30 then raise exception 'ATTACHMENT_LIMIT'; end if;
    next_version:=1;
  end if;
  if p_kind='planning_context' and exists(select 1 from public.attachments where trip_reference=p_trip and kind=p_kind and status='ready' and id<>p_id) then raise exception 'DOCUMENT_CONFLICT'; end if;
  insert into public.document_writes(id,trip_reference,document_id,expected_revision,content_revision,name,kind,path,sha256,size,author)
    values(p_write,p_trip,p_id,p_expected,next_version,btrim(p_name),p_kind,p_trip::text||'/documents/'||p_id::text||'/'||p_write::text||'.md',p_hash,p_size,p_author) returning * into w;
  return to_jsonb(w);
end;
$$;
create function public.document_upload_complete(p_trip uuid,p_write uuid)
returns boolean language plpgsql set search_path = '' as $$
begin
  update public.document_writes set uploaded=true where id=p_write and trip_reference=p_trip and not discarded;
  return found;
end;
$$;
create function public.document_publish(p_trip uuid,p_write uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare w public.document_writes; a public.attachments;
begin
  perform 1 from public.trips where reference=p_trip for update;
  select * into w from public.document_writes where id=p_write and trip_reference=p_trip for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if w.published then return public.document_list(p_trip,w.document_id)->0; end if;
  if not w.uploaded or w.discarded then raise exception 'DOCUMENT_INVALID'; end if;
  select * into a from public.attachments where id=w.document_id for update;
  if found then
    if a.trip_reference<>p_trip or a.status<>'ready' or a.kind<>w.kind or a.revision<>w.expected_revision then raise exception 'DOCUMENT_CONFLICT'; end if;
    update public.attachments set path=w.path, size=w.size, name=w.name, content_revision=w.content_revision, revision=revision+1, updated_at=now() where id=a.id;
  else
    if w.expected_revision<>0 then raise exception 'DOCUMENT_CONFLICT'; end if;
    if (select count(*) from public.attachments where trip_reference=p_trip and status<>'deleted')>=30 then raise exception 'ATTACHMENT_LIMIT'; end if;
    if w.kind='planning_context' and exists(select 1 from public.attachments where trip_reference=p_trip and kind=w.kind and status='ready') then raise exception 'DOCUMENT_CONFLICT'; end if;
    insert into public.attachments(id,trip_reference,name,original_name,"mediaType",size,path,status,source,revision,content_revision,kind,signed_until)
      values(w.document_id,p_trip,w.name,w.name,'text/markdown',w.size,w.path,'ready','library',1,w.content_revision,w.kind,now());
  end if;
  insert into public.document_versions(document_id,revision,path,sha256,size,author) values(w.document_id,w.content_revision,w.path,w.sha256,w.size,w.author);
  update public.document_writes set published=true where id=p_write;
  return public.document_list(p_trip,w.document_id)->0;
end;
$$;
create function public.document_version(p_trip uuid,p_id uuid,p_revision integer default null)
returns jsonb language plpgsql set search_path = '' as $$
declare a public.attachments; v public.document_versions;
begin
  select * into a from public.attachments where id=p_id and trip_reference=p_trip;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if a.status<>'ready' then raise exception 'DOCUMENT_GONE'; end if;
  select * into v from public.document_versions where document_id=p_id and revision=coalesce(p_revision,a.content_revision);
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  return to_jsonb(v);
end;
$$;
create function public.document_paths(p_trip uuid,p_id uuid)
returns jsonb language sql set search_path = '' as $$
  select coalesce(jsonb_agg(path),'[]'::jsonb) from (
    select path from public.attachments where id=p_id and trip_reference=p_trip and status in ('deleting','deleted')
    union select v.path from public.document_versions v join public.attachments a on a.id=v.document_id where a.id=p_id and a.trip_reference=p_trip and a.status in ('deleting','deleted')
    union select w.path from public.document_writes w join public.attachments a on a.id=w.document_id where a.id=p_id and a.trip_reference=p_trip and a.status in ('deleting','deleted')
  ) paths;
$$;
create function public.document_abandoned(p_done uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare result jsonb;
begin
  if p_done is not null then update public.document_writes set cleaned=true where id=p_done and discarded and not published; return '[]'::jsonb; end if;
  with due as (select id from public.document_writes where not published and not cleaned and created_at < now()-interval '24 hours' order by created_at limit 10 for update skip locked),
  changed as (update public.document_writes w set discarded=true from due where w.id=due.id returning w.id,w.path)
  select coalesce(jsonb_agg(to_jsonb(changed)),'[]'::jsonb) into result from changed;
  return result;
end;
$$;
revoke all on function public.document_stage(uuid,uuid,uuid,text,text,integer,integer,text,text), public.document_upload_complete(uuid,uuid), public.document_publish(uuid,uuid), public.document_version(uuid,uuid,integer), public.document_paths(uuid,uuid), public.document_abandoned(uuid) from public,anon,authenticated;
grant execute on function public.document_stage(uuid,uuid,uuid,text,text,integer,integer,text,text), public.document_upload_complete(uuid,uuid), public.document_publish(uuid,uuid), public.document_version(uuid,uuid,integer), public.document_paths(uuid,uuid), public.document_abandoned(uuid) to service_role;
notify pgrst,'reload schema';
commit;
