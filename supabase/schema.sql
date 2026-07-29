create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  school text not null check (school in ('SCD', 'TBS', 'SSET')),
  major text not null check (length(trim(major)) > 0),
  skills text[] not null default '{}',
  contact_type text not null check (contact_type in ('email', 'instagram', 'messenger', 'url')),
  contact_value text,
  short_bio text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_contact_value_required_for_real_users check (
    is_demo
    or (contact_value is not null and length(trim(contact_value)) > 0)
  )
);

create table if not exists public.team_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  school text check (school is null or school in ('SCD', 'TBS', 'SSET')),
  major text,
  course text not null check (length(trim(course)) > 0),
  course_name text,
  course_code text,
  class_session text,
  skills_needed text[] not null default '{}',
  members_needed integer not null check (members_needed > 0),
  availability text[] not null default '{}',
  preferred_active_time text check (
    preferred_active_time is null
    or preferred_active_time in ('morning', 'afternoon', 'evening')
  ),
  work_style text,
  work_styles text[] not null default '{}',
  requirements text,
  requirements_data jsonb not null default '{}'::jsonb,
  requires_portfolio boolean not null default false,
  portfolio_reference_path text,
  portfolio_reference_name text,
  status text not null default 'looking' check (status in ('looking', 'found')),
  edit_token text not null check (length(edit_token) >= 32),
  created_at timestamptz not null default now()
);

create index if not exists profiles_is_demo_idx on public.profiles(is_demo);
create index if not exists profiles_skills_gin_idx on public.profiles using gin(skills);
create index if not exists team_requests_profile_id_idx on public.team_requests(profile_id);
create index if not exists team_requests_school_idx on public.team_requests(school);
create index if not exists team_requests_major_idx on public.team_requests(major);
create index if not exists team_requests_status_idx on public.team_requests(status);
create index if not exists team_requests_course_idx on public.team_requests(lower(course));
create index if not exists team_requests_course_code_idx on public.team_requests(course_code);
create index if not exists team_requests_course_name_idx on public.team_requests(lower(course_name));
create index if not exists team_requests_class_session_idx on public.team_requests(class_session);
create index if not exists team_requests_skills_needed_gin_idx on public.team_requests using gin(skills_needed);
create index if not exists team_requests_availability_gin_idx on public.team_requests using gin(availability);
create index if not exists team_requests_work_styles_gin_idx on public.team_requests using gin(work_styles);
create index if not exists team_requests_requirements_data_gin_idx on public.team_requests using gin(requirements_data);
create index if not exists team_requests_requires_portfolio_idx on public.team_requests(requires_portfolio);

alter table public.profiles enable row level security;
alter table public.team_requests enable row level security;

drop policy if exists "Public can read profiles" on public.profiles;
create policy "Public can read profiles"
on public.profiles
for select
to anon
using (true);

drop policy if exists "Anonymous can create profiles" on public.profiles;
create policy "Anonymous can create profiles"
on public.profiles
for insert
to anon
with check (is_demo = false);

drop policy if exists "Public can read looking requests" on public.team_requests;
create policy "Public can read looking requests"
on public.team_requests
for select
to anon
using (status = 'looking');

drop policy if exists "Anonymous can create team requests" on public.team_requests;
create policy "Anonymous can create team requests"
on public.team_requests
for insert
to anon
with check (status = 'looking');

revoke update on public.profiles from anon;
grant select, insert on public.profiles to anon;
revoke update on public.team_requests from anon;
grant select, insert on public.team_requests to anon;

create or replace function public.mark_team_request_found(
  request_id uuid,
  request_edit_token text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.team_requests tr
  set status = 'found'
  where tr.id = request_id
    and tr.edit_token = request_edit_token
    and tr.status = 'looking'
  returning tr.id, tr.status;
end;
$$;

revoke all on function public.mark_team_request_found(uuid, text) from public;
grant execute on function public.mark_team_request_found(uuid, text) to anon;

create or replace function public.update_profile(
  p_profile_id uuid,
  p_full_name text,
  p_school text,
  p_major text,
  p_skills text[],
  p_contact_type text,
  p_contact_value text,
  p_short_bio text
)
returns table(
  id uuid,
  full_name text,
  school text,
  major text,
  skills text[],
  contact_type text,
  contact_value text,
  short_bio text,
  is_demo boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.profiles p
  set
    full_name = trim(p_full_name),
    school = trim(p_school),
    major = trim(p_major),
    skills = p_skills,
    contact_type = p_contact_type,
    contact_value = trim(p_contact_value),
    short_bio = trim(p_short_bio)
  where p.id = p_profile_id
    and p.is_demo = false
  returning
    p.id,
    p.full_name,
    p.school,
    p.major,
    p.skills,
    p.contact_type,
    p.contact_value,
    p.short_bio,
    p.is_demo,
    p.created_at;
end;
$$;

revoke all on function public.update_profile(uuid, text, text, text, text[], text, text, text) from public;
grant execute on function public.update_profile(uuid, text, text, text, text[], text, text, text) to anon;

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  receiver_profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_team_request_id uuid references public.team_requests(id) on delete cascade,
  intro_message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connections_not_self check (sender_profile_id <> receiver_profile_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  message_text text not null check (length(trim(message_text)) > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_request_id uuid not null references public.team_requests(id) on delete cascade,
  teammate_profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  added_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_request_id, teammate_profile_id)
);

create unique index if not exists connections_active_pair_unique_idx
on public.connections (
  least(sender_profile_id, receiver_profile_id),
  greatest(sender_profile_id, receiver_profile_id)
)
where status in ('pending', 'accepted');

create index if not exists connections_sender_idx on public.connections(sender_profile_id);
create index if not exists connections_receiver_idx on public.connections(receiver_profile_id);
create index if not exists connections_status_idx on public.connections(status);
create index if not exists messages_connection_created_idx on public.messages(connection_id, created_at);
create index if not exists messages_sender_idx on public.messages(sender_profile_id);
create index if not exists team_members_request_idx on public.team_members(team_request_id);
create index if not exists team_members_connection_idx on public.team_members(connection_id);

alter table public.connections enable row level security;
alter table public.messages enable row level security;
alter table public.team_members enable row level security;

revoke all on public.connections from anon;
revoke all on public.messages from anon;
revoke all on public.team_members from anon;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists connections_touch_updated_at on public.connections;
create trigger connections_touch_updated_at
before update on public.connections
for each row
execute function public.touch_updated_at();

create or replace function public.send_connection_request(
  sender_profile uuid,
  receiver_profile uuid,
  sender_request uuid,
  intro_message text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  receiver_exists boolean;
  created_connection public.connections;
begin
  select true into receiver_exists
  from public.profiles
  where profiles.id = receiver_profile;

  if receiver_exists is null then
    raise exception 'Receiver profile does not exist.';
  end if;

  if sender_request is not null and not exists (
    select 1
    from public.team_requests tr
    where tr.id = sender_request
      and tr.profile_id = sender_profile
      and tr.status = 'looking'
  ) then
    raise exception 'Sender request is not active.';
  end if;

  select c.* into created_connection
  from public.connections c
  where least(c.sender_profile_id, c.receiver_profile_id) = least(sender_profile, receiver_profile)
    and greatest(c.sender_profile_id, c.receiver_profile_id) = greatest(sender_profile, receiver_profile)
    and c.status in ('pending', 'accepted')
  limit 1;

  if created_connection.id is not null then
    return query select created_connection.id, created_connection.status;
    return;
  end if;

  insert into public.connections (
    sender_profile_id,
    receiver_profile_id,
    sender_team_request_id,
    intro_message,
    status
  )
  values (
    sender_profile,
    receiver_profile,
    sender_request,
    nullif(trim(intro_message), ''),
    'pending'
  )
  returning * into created_connection;

  return query select created_connection.id, created_connection.status;
end;
$$;

create or replace function public.respond_connection_request(
  connection_request uuid,
  receiver_profile uuid,
  response_status text
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if response_status not in ('accepted', 'declined') then
    raise exception 'Invalid connection response.';
  end if;

  return query
  update public.connections c
  set status = response_status
  where c.id = connection_request
    and c.receiver_profile_id = receiver_profile
    and c.status = 'pending'
  returning c.id, c.status;
end;
$$;

create or replace function public.cancel_connection_request(
  connection_request uuid,
  sender_profile uuid
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.connections c
  set status = 'cancelled'
  where c.id = connection_request
    and c.sender_profile_id = sender_profile
    and c.status = 'pending'
  returning c.id, c.status;
end;
$$;

create or replace function public.get_connection_between(
  current_profile uuid,
  teammate_profile uuid
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  sender_team_request_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.sender_profile_id,
    c.receiver_profile_id,
    c.sender_team_request_id,
    c.status,
    c.created_at,
    c.updated_at
  from public.connections c
  where least(c.sender_profile_id, c.receiver_profile_id) = least(current_profile, teammate_profile)
    and greatest(c.sender_profile_id, c.receiver_profile_id) = greatest(current_profile, teammate_profile)
  order by c.created_at desc
  limit 1;
$$;

drop function if exists public.list_connection_requests(uuid, text);

create or replace function public.list_connection_requests(
  current_profile uuid,
  direction text
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  sender_team_request_id uuid,
  intro_message text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_school text,
  teammate_major text,
  teammate_skills text[],
  course text,
  course_name text,
  course_code text,
  class_session text,
  skills_needed text[],
  work_styles text[],
  members_needed integer
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.sender_profile_id,
    c.receiver_profile_id,
    c.sender_team_request_id,
    c.intro_message,
    c.status,
    c.created_at,
    c.updated_at,
    case when direction = 'incoming' then c.sender_profile_id else c.receiver_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.school as teammate_school,
    p.major as teammate_major,
    p.skills as teammate_skills,
    tr.course,
    tr.course_name,
    tr.course_code,
    tr.class_session,
    tr.skills_needed,
    tr.work_styles,
    tr.members_needed
  from public.connections c
  join public.profiles p
    on p.id = case when direction = 'incoming' then c.sender_profile_id else c.receiver_profile_id end
  left join public.team_requests tr on tr.id = c.sender_team_request_id
  where (
      direction = 'incoming'
      and c.receiver_profile_id = current_profile
      and c.status = 'pending'
    )
    or (
      direction = 'sent'
      and c.sender_profile_id = current_profile
      and c.status in ('pending', 'accepted', 'declined', 'cancelled')
    )
  order by c.updated_at desc;
$$;

create or replace function public.send_message(
  connection_request uuid,
  sender_profile uuid,
  body text
)
returns table(id uuid, connection_id uuid, sender_profile_id uuid, message_text text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(body)) = 0 then
    raise exception 'Message text is required.';
  end if;

  if not exists (
    select 1
    from public.connections c
    where c.id = connection_request
      and c.status = 'accepted'
      and sender_profile in (c.sender_profile_id, c.receiver_profile_id)
  ) then
    raise exception 'Accepted connection required.';
  end if;

  return query
  insert into public.messages (connection_id, sender_profile_id, message_text)
  values (connection_request, sender_profile, trim(body))
  returning messages.id, messages.connection_id, messages.sender_profile_id, messages.message_text, messages.created_at;
end;
$$;

create or replace function public.list_messages(
  connection_request uuid,
  current_profile uuid
)
returns table(id uuid, connection_id uuid, sender_profile_id uuid, message_text text, created_at timestamptz, read_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select m.id, m.connection_id, m.sender_profile_id, m.message_text, m.created_at, m.read_at
  from public.messages m
  join public.connections c on c.id = m.connection_id
  where m.connection_id = connection_request
    and c.status = 'accepted'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  order by m.created_at asc;
$$;

create or replace function public.list_message_threads(
  current_profile uuid
)
returns table(
  connection_id uuid,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_major text,
  last_message text,
  last_message_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id as connection_id,
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.major as teammate_major,
    lm.message_text as last_message,
    lm.created_at as last_message_at,
    c.updated_at
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  left join lateral (
    select message_text, created_at
    from public.messages m
    where m.connection_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where c.status = 'accepted'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  order by coalesce(lm.created_at, c.updated_at) desc;
$$;

create or replace function public.get_connection_detail(
  connection_request uuid,
  current_profile uuid
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  status text,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_major text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.sender_profile_id,
    c.receiver_profile_id,
    c.status,
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.major as teammate_major
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  where c.id = connection_request
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  limit 1;
$$;

create or replace function public.add_team_member(
  current_profile uuid,
  current_request uuid,
  connection_request uuid
)
returns table(id uuid, team_request_id uuid, teammate_profile_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  teammate uuid;
  member_row public.team_members;
begin
  select
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  into teammate
  from public.connections c
  where c.id = connection_request
    and c.status = 'accepted'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id);

  if teammate is null then
    raise exception 'Accepted connection required.';
  end if;

  if not exists (
    select 1
    from public.team_requests tr
    where tr.id = current_request
      and tr.profile_id = current_profile
  ) then
    raise exception 'Current request does not belong to profile.';
  end if;

  insert into public.team_members (
    team_request_id,
    teammate_profile_id,
    connection_id,
    added_by_profile_id
  )
  values (
    current_request,
    teammate,
    connection_request,
    current_profile
  )
  on conflict (team_request_id, teammate_profile_id)
  do update set connection_id = excluded.connection_id
  returning * into member_row;

  return query select member_row.id, member_row.team_request_id, member_row.teammate_profile_id;
end;
$$;

grant execute on function public.send_connection_request(uuid, uuid, uuid, text) to anon;
grant execute on function public.respond_connection_request(uuid, uuid, text) to anon;
grant execute on function public.cancel_connection_request(uuid, uuid) to anon;
grant execute on function public.get_connection_between(uuid, uuid) to anon;
grant execute on function public.list_connection_requests(uuid, text) to anon;
grant execute on function public.send_message(uuid, uuid, text) to anon;
grant execute on function public.list_messages(uuid, uuid) to anon;
grant execute on function public.list_message_threads(uuid) to anon;
grant execute on function public.get_connection_detail(uuid, uuid) to anon;
grant execute on function public.add_team_member(uuid, uuid, uuid) to anon;

create or replace function public.simulate_demo_acceptance(
  connection_request uuid,
  current_profile uuid
)
returns table(id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.connections c
  set status = 'accepted'
  from public.profiles receiver
  where c.id = connection_request
    and c.sender_profile_id = current_profile
    and c.receiver_profile_id = receiver.id
    and receiver.is_demo = true
    and c.status = 'pending'
  returning c.id, c.status;
end;
$$;

create or replace function public.send_demo_reply(
  connection_request uuid,
  current_profile uuid,
  reply_text text
)
returns table(id uuid, connection_id uuid, sender_profile_id uuid, message_text text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_profile uuid;
begin
  select c.receiver_profile_id into demo_profile
  from public.connections c
  join public.profiles p on p.id = c.receiver_profile_id
  where c.id = connection_request
    and c.sender_profile_id = current_profile
    and c.status = 'accepted'
    and p.is_demo = true;

  if demo_profile is null then
    raise exception 'Accepted demo connection required.';
  end if;

  return query
  insert into public.messages (connection_id, sender_profile_id, message_text)
  values (connection_request, demo_profile, trim(reply_text))
  returning messages.id, messages.connection_id, messages.sender_profile_id, messages.message_text, messages.created_at;
end;
$$;

create or replace function public.reset_demo_connection(
  connection_request uuid,
  current_profile uuid
)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_id uuid;
begin
  delete from public.messages m
  using public.connections c, public.profiles p
  where m.connection_id = c.id
    and c.id = connection_request
    and c.sender_profile_id = current_profile
    and c.receiver_profile_id = p.id
    and p.is_demo = true;

  delete from public.connections c
  using public.profiles p
  where c.id = connection_request
    and c.sender_profile_id = current_profile
    and c.receiver_profile_id = p.id
    and p.is_demo = true
  returning c.id into deleted_id;

  return query select deleted_id;
end;
$$;

grant execute on function public.simulate_demo_acceptance(uuid, uuid) to anon;
grant execute on function public.send_demo_reply(uuid, uuid, text) to anon;
grant execute on function public.reset_demo_connection(uuid, uuid) to anon;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'request-portfolios',
  'request-portfolios',
  true,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anon can read request portfolio references" on storage.objects;
create policy "Anon can read request portfolio references"
on storage.objects
for select
to anon
using (bucket_id = 'request-portfolios');

drop policy if exists "Anon can upload request portfolio references" on storage.objects;
create policy "Anon can upload request portfolio references"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'request-portfolios'
  and lower(name) ~ '\.(pdf|png|jpg|jpeg)$'
);
