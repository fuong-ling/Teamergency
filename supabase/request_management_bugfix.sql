create extension if not exists pgcrypto with schema extensions;

alter table public.team_requests
add column if not exists updated_at timestamptz not null default now();

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.team_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
      and pg_get_constraintdef(oid) like '%looking%'
  loop
    execute format('alter table public.team_requests drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.team_requests
add constraint team_requests_status_check
check (status in ('looking', 'found', 'cancelled'));

create index if not exists team_requests_profile_status_created_idx
on public.team_requests(profile_id, status, created_at desc);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.connections'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
      and pg_get_constraintdef(oid) like '%pending%'
  loop
    execute format('alter table public.connections drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.connections
add constraint connections_status_check
check (status in ('pending', 'accepted', 'declined', 'cancelled', 'unmatched'));

alter table public.connections
add column if not exists unmatched_by_profile_id uuid references public.profiles(id) on delete set null,
add column if not exists unmatch_reason text,
add column if not exists unmatch_note text,
add column if not exists unmatched_at timestamptz;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  type text not null,
  connection_id uuid references public.connections(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_unread_idx
on public.notifications(recipient_profile_id, is_read, created_at desc);

alter table public.notifications enable row level security;

create or replace function public.list_my_team_requests(
  current_profile uuid
)
returns table(
  id uuid,
  profile_id uuid,
  school text,
  major text,
  course text,
  course_name text,
  course_code text,
  class_session text,
  skills_needed text[],
  members_needed integer,
  work_styles text[],
  requirements text,
  requirements_data jsonb,
  requires_portfolio boolean,
  portfolio_reference_path text,
  portfolio_reference_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    tr.id,
    tr.profile_id,
    tr.school,
    tr.major,
    tr.course,
    tr.course_name,
    tr.course_code,
    tr.class_session,
    tr.skills_needed,
    tr.members_needed,
    tr.work_styles,
    tr.requirements,
    tr.requirements_data,
    tr.requires_portfolio,
    tr.portfolio_reference_path,
    tr.portfolio_reference_name,
    tr.status,
    tr.created_at,
    tr.updated_at
  from public.team_requests tr
  where tr.profile_id = current_profile
    and public.owns_profile(current_profile)
  order by
    case tr.status
      when 'looking' then 1
      when 'found' then 2
      when 'cancelled' then 3
      else 4
    end,
    tr.created_at desc;
$$;

create or replace function public.update_team_request(
  p_request_id uuid,
  p_profile_id uuid,
  p_school text,
  p_major text,
  p_course text,
  p_course_name text,
  p_course_code text,
  p_class_session text,
  p_skills_needed text[],
  p_members_needed integer,
  p_work_styles text[],
  p_requirements_data jsonb,
  p_requires_portfolio boolean,
  p_portfolio_reference_path text,
  p_portfolio_reference_name text,
  p_requirements text
)
returns table(
  id uuid,
  profile_id uuid,
  school text,
  major text,
  course text,
  course_name text,
  course_code text,
  class_session text,
  skills_needed text[],
  members_needed integer,
  work_styles text[],
  requirements text,
  requirements_data jsonb,
  requires_portfolio boolean,
  portfolio_reference_path text,
  portfolio_reference_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if p_school not in ('SCD', 'TBS', 'SSET') then
    raise exception 'Invalid school.';
  end if;

  if p_members_needed < 1 then
    raise exception 'Members needed must be greater than zero.';
  end if;

  return query
  update public.team_requests tr
  set
    school = p_school,
    major = trim(p_major),
    course = trim(p_course),
    course_name = trim(p_course_name),
    course_code = trim(p_course_code),
    class_session = trim(p_class_session),
    skills_needed = coalesce(p_skills_needed, '{}'),
    members_needed = p_members_needed,
    work_styles = coalesce(p_work_styles, '{}'),
    requirements_data = coalesce(p_requirements_data, '{}'::jsonb),
    requires_portfolio = coalesce(p_requires_portfolio, false),
    portfolio_reference_path = p_portfolio_reference_path,
    portfolio_reference_name = p_portfolio_reference_name,
    requirements = nullif(trim(coalesce(p_requirements, '')), ''),
    updated_at = now()
  where tr.id = p_request_id
    and tr.profile_id = p_profile_id
  returning
    tr.id,
    tr.profile_id,
    tr.school,
    tr.major,
    tr.course,
    tr.course_name,
    tr.course_code,
    tr.class_session,
    tr.skills_needed,
    tr.members_needed,
    tr.work_styles,
    tr.requirements,
    tr.requirements_data,
    tr.requires_portfolio,
    tr.portfolio_reference_path,
    tr.portfolio_reference_name,
    tr.status,
    tr.created_at,
    tr.updated_at;
end;
$$;

create or replace function public.cancel_team_request(
  request_id uuid,
  current_profile uuid
)
returns table(id uuid, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(current_profile) then
    raise exception 'Profile ownership required.';
  end if;

  return query
  update public.team_requests tr
  set status = 'cancelled', updated_at = now()
  where tr.id = request_id
    and tr.profile_id = current_profile
    and tr.status = 'looking'
  returning tr.id, tr.status, tr.updated_at;
end;
$$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%connection_request%'
  loop
    execute format('alter table public.notifications drop constraint %I', constraint_name);
  end loop;
end;
$$;

update public.notifications
set type = 'connection_unmatched'
where type = 'connection_ended';

alter table public.notifications
add constraint notifications_type_check
check (type in (
  'connection_request',
  'connection_accepted',
  'connection_declined',
  'connection_unmatched',
  'new_message'
));

create or replace function public.create_notification(
  recipient_profile uuid,
  actor_profile uuid,
  notification_type text,
  related_connection uuid default null,
  related_message uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if recipient_profile is null or recipient_profile = actor_profile then
    return;
  end if;

  if notification_type not in (
    'connection_request',
    'connection_accepted',
    'connection_declined',
    'connection_unmatched',
    'new_message'
  ) then
    return;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = recipient_profile
      and p.is_demo = false
  ) then
    return;
  end if;

  insert into public.notifications (
    recipient_profile_id,
    actor_profile_id,
    type,
    connection_id,
    message_id
  )
  values (
    recipient_profile,
    actor_profile,
    notification_type,
    related_connection,
    related_message
  );
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
declare
  updated_connection public.connections;
  notification_type text;
begin
  if response_status not in ('accepted', 'declined') then
    raise exception 'Invalid connection response.';
  end if;

  if not public.owns_profile(receiver_profile) then
    raise exception 'Receiver profile ownership required.';
  end if;

  update public.connections c
  set status = response_status
  where c.id = connection_request
    and c.receiver_profile_id = receiver_profile
    and c.status = 'pending'
  returning * into updated_connection;

  if updated_connection.id is null then
    return;
  end if;

  notification_type := case
    when response_status = 'accepted' then 'connection_accepted'
    else 'connection_declined'
  end;

  perform public.create_notification(updated_connection.sender_profile_id, receiver_profile, notification_type, updated_connection.id, null);

  return query select updated_connection.id, updated_connection.status;
end;
$$;

create or replace function public.unmatch_connection_request(
  connection_request uuid,
  current_profile uuid,
  reason text,
  note text
)
returns table(id uuid, status text, unmatched_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_connection public.connections;
  teammate uuid;
begin
  if reason not in (
    'Our skills or expectations are not a good fit',
    'Our working styles are not compatible',
    'I found another teammate',
    'No response / inactive',
    'Connected by mistake',
    'Our project needs have changed',
    'Other'
  ) then
    raise exception 'Invalid unmatch reason.';
  end if;

  if not public.owns_profile(current_profile) then
    raise exception 'Current profile ownership required.';
  end if;

  update public.connections c
  set
    status = 'unmatched',
    unmatched_by_profile_id = current_profile,
    unmatch_reason = reason,
    unmatch_note = nullif(trim(coalesce(note, '')), ''),
    unmatched_at = now()
  where c.id = connection_request
    and c.status = 'accepted'
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  returning * into updated_connection;

  if updated_connection.id is null then
    return;
  end if;

  teammate := case
    when updated_connection.sender_profile_id = current_profile then updated_connection.receiver_profile_id
    else updated_connection.sender_profile_id
  end;

  perform public.create_notification(teammate, current_profile, 'connection_unmatched', updated_connection.id, null);

  return query select updated_connection.id, updated_connection.status, updated_connection.unmatched_at;
end;
$$;

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
  teammate_is_demo boolean,
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
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.school as teammate_school,
    p.major as teammate_major,
    p.skills as teammate_skills,
    p.is_demo as teammate_is_demo,
    tr.course,
    tr.course_name,
    tr.course_code,
    tr.class_session,
    tr.skills_needed,
    tr.work_styles,
    tr.members_needed
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  left join public.team_requests tr on tr.id = c.sender_team_request_id
  where public.owns_profile(current_profile)
    and (
      (direction in ('received', 'incoming') and c.receiver_profile_id = current_profile and c.status = 'pending')
      or (direction = 'sent' and c.sender_profile_id = current_profile and c.status = 'pending')
      or (direction = 'connected' and current_profile in (c.sender_profile_id, c.receiver_profile_id) and c.status = 'accepted')
      or (direction in ('declined', 'not_accepted') and current_profile in (c.sender_profile_id, c.receiver_profile_id) and c.status in ('declined', 'cancelled'))
      or (direction = 'unmatched' and current_profile in (c.sender_profile_id, c.receiver_profile_id) and c.status = 'unmatched')
    )
  order by c.updated_at desc;
$$;

create or replace function public.get_notification_counts(
  current_profile uuid
)
returns table(connections_count integer, messages_count integer)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where n.type in ('connection_request', 'connection_accepted', 'connection_declined', 'connection_unmatched'))::integer as connections_count,
    count(*) filter (where n.type = 'new_message')::integer as messages_count
  from public.notifications n
  where public.owns_profile(current_profile)
    and n.recipient_profile_id = current_profile
    and n.is_read = false;
$$;

create or replace function public.mark_notifications_read(
  current_profile uuid,
  area text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_profile(current_profile) then
    raise exception 'Current profile ownership required.';
  end if;

  update public.notifications n
  set is_read = true
  where n.recipient_profile_id = current_profile
    and n.is_read = false
    and (
      area = 'all'
      or (area = 'connections' and n.type in ('connection_request', 'connection_accepted', 'connection_declined', 'connection_unmatched'))
      or (area = 'messages' and n.type = 'new_message')
    );
end;
$$;

revoke all on function public.list_my_team_requests(uuid) from public;
revoke all on function public.update_team_request(uuid, uuid, text, text, text, text, text, text, text[], integer, text[], jsonb, boolean, text, text, text) from public;
revoke all on function public.cancel_team_request(uuid, uuid) from public;
revoke all on function public.create_notification(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.respond_connection_request(uuid, uuid, text) from public;
revoke all on function public.unmatch_connection_request(uuid, uuid, text, text) from public;
revoke all on function public.list_connection_requests(uuid, text) from public;
revoke all on function public.get_notification_counts(uuid) from public;
revoke all on function public.mark_notifications_read(uuid, text) from public;

grant execute on function public.list_my_team_requests(uuid) to authenticated;
grant execute on function public.update_team_request(uuid, uuid, text, text, text, text, text, text, text[], integer, text[], jsonb, boolean, text, text, text) to authenticated;
grant execute on function public.cancel_team_request(uuid, uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid, uuid, text) to authenticated;
grant execute on function public.unmatch_connection_request(uuid, uuid, text, text) to authenticated;
grant execute on function public.list_connection_requests(uuid, text) to authenticated;
grant execute on function public.get_notification_counts(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid, text) to authenticated;
