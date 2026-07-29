alter table public.team_requests
add column if not exists school text;

alter table public.team_requests
add column if not exists major text;

alter table public.team_requests
add column if not exists class_session text;

update public.team_requests tr
set
  school = coalesce(tr.school, p.school),
  major = coalesce(tr.major, p.major),
  class_session = coalesce(tr.class_session, 'Not specified')
from public.profiles p
where tr.profile_id = p.id;

alter table public.connections
alter column sender_team_request_id drop not null;

alter table public.connections
add column if not exists intro_message text;

create index if not exists team_requests_school_idx on public.team_requests(school);
create index if not exists team_requests_major_idx on public.team_requests(major);
create index if not exists team_requests_class_session_idx on public.team_requests(class_session);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_school_code_check'
  ) then
    alter table public.profiles
    add constraint profiles_school_code_check
    check (school in ('SCD', 'TBS', 'SSET'))
    not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_requests_school_code_check'
  ) then
    alter table public.team_requests
    add constraint team_requests_school_code_check
    check (school is null or school in ('SCD', 'TBS', 'SSET'))
    not valid;
  end if;
end $$;

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
  receiver_is_demo boolean;
  created_connection public.connections;
begin
  select is_demo into receiver_is_demo
  from public.profiles
  where profiles.id = receiver_profile;

  if receiver_is_demo is null then
    raise exception 'Receiver profile does not exist.';
  end if;

  if receiver_is_demo then
    raise exception 'Demo profile connection unavailable.';
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

revoke all on function public.send_connection_request(uuid, uuid, uuid, text) from public;
grant execute on function public.send_connection_request(uuid, uuid, uuid, text) to anon;
grant execute on function public.list_connection_requests(uuid, text) to anon;
