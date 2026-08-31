create extension if not exists pgcrypto with schema extensions;

alter table public.team_requests
add column if not exists total_team_size integer,
add column if not exists teammates_needed_initial integer;

update public.team_requests
set teammates_needed_initial = coalesce(teammates_needed_initial, members_needed, 1)
where teammates_needed_initial is null;

update public.team_requests
set total_team_size = coalesce(total_team_size, greatest(teammates_needed_initial + 1, 2))
where total_team_size is null;

update public.team_requests
set members_needed = teammates_needed_initial
where members_needed is distinct from teammates_needed_initial;

alter table public.team_requests
alter column total_team_size set default 2,
alter column teammates_needed_initial set default 1,
alter column total_team_size set not null,
alter column teammates_needed_initial set not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.team_requests'::regclass
      and contype = 'c'
      and conname in ('team_requests_team_size_check', 'team_requests_members_needed_check')
  loop
    execute format('alter table public.team_requests drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.team_requests
add constraint team_requests_team_size_check
check (
  total_team_size >= 2
  and teammates_needed_initial >= 1
  and teammates_needed_initial < total_team_size
  and members_needed >= 1
);

alter table public.connections
add column if not exists receiver_team_request_id uuid references public.team_requests(id) on delete set null;

create index if not exists connections_sender_request_status_idx
on public.connections(sender_team_request_id, status);

create index if not exists connections_receiver_request_status_idx
on public.connections(receiver_team_request_id, status);

update public.connections c
set receiver_team_request_id = (
  select tr.id
  from public.team_requests sender_request
  join public.team_requests tr on tr.profile_id = c.receiver_profile_id
  where sender_request.id = c.sender_team_request_id
    and tr.status = 'looking'
    and lower(coalesce(tr.major, '')) = lower(coalesce(sender_request.major, ''))
    and (
      lower(coalesce(tr.course_code, '')) = lower(coalesce(sender_request.course_code, ''))
      or lower(coalesce(tr.course_name, tr.course, '')) = lower(coalesce(sender_request.course_name, sender_request.course, ''))
    )
  order by
    (lower(coalesce(tr.class_session, '')) = lower(coalesce(sender_request.class_session, ''))) desc,
    (
      select count(*)
      from unnest(coalesce(tr.skills_needed, '{}'::text[])) as receiver_skill(skill)
      join unnest(coalesce(sender_request.skills_needed, '{}'::text[])) as sender_skill(skill)
        on lower(receiver_skill.skill) = lower(sender_skill.skill)
    ) desc,
    tr.created_at desc
  limit 1
)
where c.sender_team_request_id is not null
  and c.receiver_team_request_id is null;

drop function if exists public.list_my_team_requests(uuid);
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
  total_team_size integer,
  teammates_needed_initial integer,
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
    tr.total_team_size,
    tr.teammates_needed_initial,
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

drop function if exists public.list_active_team_requests();
create or replace function public.list_active_team_requests()
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
  total_team_size integer,
  teammates_needed_initial integer,
  availability text[],
  preferred_active_time text,
  work_style text,
  work_styles text[],
  requirements text,
  requirements_data jsonb,
  requires_portfolio boolean,
  portfolio_reference_path text,
  portfolio_reference_name text,
  status text,
  created_at timestamptz,
  profile jsonb
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
    tr.total_team_size,
    tr.teammates_needed_initial,
    tr.availability,
    tr.preferred_active_time,
    tr.work_style,
    tr.work_styles,
    tr.requirements,
    tr.requirements_data,
    tr.requires_portfolio,
    tr.portfolio_reference_path,
    tr.portfolio_reference_name,
    tr.status,
    tr.created_at,
    public.public_profile_json(p) as profile
  from public.team_requests tr
  join public.profiles p on p.id = tr.profile_id
  where tr.status = 'looking'
    and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
  order by tr.created_at desc;
$$;

drop function if exists public.get_team_request_public(uuid);
create or replace function public.get_team_request_public(requested_request uuid)
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
  total_team_size integer,
  teammates_needed_initial integer,
  availability text[],
  preferred_active_time text,
  work_style text,
  work_styles text[],
  requirements text,
  requirements_data jsonb,
  requires_portfolio boolean,
  portfolio_reference_path text,
  portfolio_reference_name text,
  status text,
  created_at timestamptz,
  profile jsonb
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
    tr.total_team_size,
    tr.teammates_needed_initial,
    tr.availability,
    tr.preferred_active_time,
    tr.work_style,
    tr.work_styles,
    tr.requirements,
    tr.requirements_data,
    tr.requires_portfolio,
    tr.portfolio_reference_path,
    tr.portfolio_reference_name,
    tr.status,
    tr.created_at,
    public.public_profile_json(p) as profile
  from public.team_requests tr
  join public.profiles p on p.id = tr.profile_id
  where tr.id = requested_request
    and (tr.status = 'looking' or p.owner_id = auth.uid())
    and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
  limit 1;
$$;

drop function if exists public.create_team_request(
  uuid, text, text, text, text, text, text, text[], integer, text[], jsonb, boolean, text, text, text
);
drop function if exists public.create_team_request(
  uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text
);
create or replace function public.create_team_request(
  p_profile_id uuid,
  p_school text,
  p_major text,
  p_course text,
  p_course_name text,
  p_course_code text,
  p_class_session text,
  p_skills_needed text[],
  p_members_needed integer,
  p_total_team_size integer,
  p_teammates_needed_initial integer,
  p_work_styles text[],
  p_requirements_data jsonb,
  p_requires_portfolio boolean,
  p_portfolio_reference_path text,
  p_portfolio_reference_name text,
  p_requirements text
)
returns table(id uuid, profile_id uuid, status text, created_at timestamptz, edit_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_request public.team_requests;
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if p_school not in ('SCD', 'TBS', 'SSET') then
    raise exception 'Invalid school.';
  end if;

  if p_total_team_size < 2 or p_teammates_needed_initial < 1 then
    raise exception 'Team size values are invalid.';
  end if;

  if p_teammates_needed_initial >= p_total_team_size then
    raise exception 'You cannot look for more teammates than the total team size.';
  end if;

  insert into public.team_requests (
    profile_id,
    school,
    major,
    course,
    course_name,
    course_code,
    class_session,
    skills_needed,
    members_needed,
    total_team_size,
    teammates_needed_initial,
    availability,
    preferred_active_time,
    work_style,
    work_styles,
    requirements_data,
    requires_portfolio,
    portfolio_reference_path,
    portfolio_reference_name,
    requirements,
    status,
    edit_token
  )
  values (
    p_profile_id,
    p_school,
    trim(p_major),
    trim(p_course),
    trim(p_course_name),
    trim(p_course_code),
    trim(p_class_session),
    coalesce(p_skills_needed, '{}'),
    p_teammates_needed_initial,
    p_total_team_size,
    p_teammates_needed_initial,
    '{}',
    null,
    null,
    coalesce(p_work_styles, '{}'),
    coalesce(p_requirements_data, '{}'::jsonb),
    coalesce(p_requires_portfolio, false),
    p_portfolio_reference_path,
    p_portfolio_reference_name,
    nullif(trim(coalesce(p_requirements, '')), ''),
    'looking',
    encode(extensions.gen_random_bytes(32), 'hex')
  )
  returning * into created_request;

  return query select
    created_request.id,
    created_request.profile_id,
    created_request.status,
    created_request.created_at,
    created_request.edit_token;
end;
$$;

drop function if exists public.update_team_request(
  uuid, uuid, text, text, text, text, text, text, text[], integer, text[], jsonb, boolean, text, text, text
);
drop function if exists public.update_team_request(
  uuid, uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text
);
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
  p_total_team_size integer,
  p_teammates_needed_initial integer,
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
  total_team_size integer,
  teammates_needed_initial integer,
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

  if p_total_team_size < 2 or p_teammates_needed_initial < 1 then
    raise exception 'Team size values are invalid.';
  end if;

  if p_teammates_needed_initial >= p_total_team_size then
    raise exception 'You cannot look for more teammates than the total team size.';
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
    members_needed = p_teammates_needed_initial,
    total_team_size = p_total_team_size,
    teammates_needed_initial = p_teammates_needed_initial,
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
    tr.total_team_size,
    tr.teammates_needed_initial,
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

create or replace function public.find_receiver_team_request(
  sender_request uuid,
  receiver_profile uuid
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select tr.id
  from public.team_requests sender_request_row
  join public.team_requests tr on tr.profile_id = receiver_profile
  where sender_request_row.id = sender_request
    and tr.status = 'looking'
    and lower(coalesce(tr.major, '')) = lower(coalesce(sender_request_row.major, ''))
    and (
      lower(coalesce(tr.course_code, '')) = lower(coalesce(sender_request_row.course_code, ''))
      or lower(coalesce(tr.course_name, tr.course, '')) = lower(coalesce(sender_request_row.course_name, sender_request_row.course, ''))
    )
  order by
    (lower(coalesce(tr.class_session, '')) = lower(coalesce(sender_request_row.class_session, ''))) desc,
    (
      select count(*)
      from unnest(coalesce(tr.skills_needed, '{}'::text[])) as receiver_skill(skill)
      join unnest(coalesce(sender_request_row.skills_needed, '{}'::text[])) as sender_skill(skill)
        on lower(receiver_skill.skill) = lower(sender_skill.skill)
    ) desc,
    tr.created_at desc
  limit 1;
$$;

drop function if exists public.send_connection_request(uuid, uuid, uuid, text);
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
  receiver_request uuid;
  created_connection public.connections;
begin
  if not public.owns_profile(sender_profile) then
    raise exception 'Sender profile ownership required.';
  end if;

  select true into receiver_exists
  from public.profiles
  where profiles.id = receiver_profile
    and (profiles.is_demo = true or profiles.consent_public_visibility = true);

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

  if sender_request is not null then
    receiver_request := public.find_receiver_team_request(sender_request, receiver_profile);
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
    receiver_team_request_id,
    intro_message,
    status
  )
  values (
    sender_profile,
    receiver_profile,
    sender_request,
    receiver_request,
    nullif(trim(coalesce(intro_message, '')), ''),
    'pending'
  )
  returning * into created_connection;

  perform public.create_notification(receiver_profile, sender_profile, 'connection_request', created_connection.id, null);

  return query select created_connection.id, created_connection.status;
end;
$$;

drop function if exists public.respond_connection_request(uuid, uuid, text);
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
  receiver_request uuid;
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

  if response_status = 'accepted' then
    if updated_connection.sender_team_request_id is not null and updated_connection.receiver_team_request_id is null then
      receiver_request := public.find_receiver_team_request(updated_connection.sender_team_request_id, receiver_profile);

      if receiver_request is not null then
        update public.connections c
        set receiver_team_request_id = receiver_request
        where c.id = updated_connection.id
        returning * into updated_connection;
      end if;
    end if;

    perform public.create_notification(updated_connection.sender_profile_id, receiver_profile, 'connection_accepted', updated_connection.id, null);
  else
    perform public.create_notification(updated_connection.sender_profile_id, receiver_profile, 'connection_declined', updated_connection.id, null);
  end if;

  return query select updated_connection.id, updated_connection.status;
end;
$$;

drop function if exists public.get_connection_between(uuid, uuid);
create or replace function public.get_connection_between(
  current_profile uuid,
  teammate_profile uuid
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  sender_team_request_id uuid,
  receiver_team_request_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  unmatched_at timestamptz
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
    c.receiver_team_request_id,
    c.status,
    c.created_at,
    c.updated_at,
    c.unmatched_at
  from public.connections c
  where public.owns_profile(current_profile)
    and least(c.sender_profile_id, c.receiver_profile_id) = least(current_profile, teammate_profile)
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
  receiver_team_request_id uuid,
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
  members_needed integer,
  total_team_size integer,
  teammates_needed_initial integer
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
    c.receiver_team_request_id,
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
    tr.members_needed,
    tr.total_team_size,
    tr.teammates_needed_initial
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  left join public.team_requests tr
    on tr.id = case
      when c.sender_profile_id = current_profile then c.sender_team_request_id
      else coalesce(c.receiver_team_request_id, c.sender_team_request_id)
    end
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

drop function if exists public.get_connection_detail(uuid, uuid);
create or replace function public.get_connection_detail(
  connection_request uuid,
  current_profile uuid
)
returns table(
  id uuid,
  sender_profile_id uuid,
  receiver_profile_id uuid,
  sender_team_request_id uuid,
  receiver_team_request_id uuid,
  status text,
  teammate_profile_id uuid,
  teammate_full_name text,
  teammate_major text,
  teammate_is_demo boolean
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
    c.receiver_team_request_id,
    c.status,
    case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
    p.full_name as teammate_full_name,
    p.major as teammate_major,
    p.is_demo as teammate_is_demo
  from public.connections c
  join public.profiles p
    on p.id = case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
  where public.owns_profile(current_profile)
    and c.id = connection_request
    and current_profile in (c.sender_profile_id, c.receiver_profile_id)
  limit 1;
$$;

drop function if exists public.get_team_request_progress(uuid, uuid);
create or replace function public.get_team_request_progress(
  request_id uuid,
  current_profile uuid
)
returns table(
  found_count integer,
  matched_count integer,
  existing_members integer,
  total_team_size integer,
  remaining_spots integer,
  teammates jsonb
)
language sql
security definer
set search_path = public
as $$
  with allowed_request as (
    select
      tr.*,
      greatest(0, tr.total_team_size - tr.teammates_needed_initial) as existing_count
    from public.team_requests tr
    where tr.id = request_id
      and tr.profile_id = current_profile
      and public.owns_profile(current_profile)
  ),
  matched as (
    select distinct on (
      case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end
    )
      case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end as teammate_profile_id,
      c.id as connection_id,
      c.updated_at
    from public.connections c
    join allowed_request ar on (
      (c.sender_profile_id = current_profile and c.sender_team_request_id = ar.id)
      or (c.receiver_profile_id = current_profile and c.receiver_team_request_id = ar.id)
    )
    where c.status = 'accepted'
      and current_profile in (c.sender_profile_id, c.receiver_profile_id)
    order by
      case when c.sender_profile_id = current_profile then c.receiver_profile_id else c.sender_profile_id end,
      c.updated_at desc
  ),
  totals as (
    select
      ar.total_team_size,
      ar.existing_count,
      count(m.teammate_profile_id)::integer as matched_count,
      least(ar.total_team_size, ar.existing_count + count(m.teammate_profile_id)::integer) as found_count
    from allowed_request ar
    left join matched m on true
    group by ar.total_team_size, ar.existing_count
  )
  select
    coalesce(t.found_count, 0)::integer as found_count,
    coalesce(t.matched_count, 0)::integer as matched_count,
    coalesce(t.existing_count, 0)::integer as existing_members,
    coalesce(t.total_team_size, 0)::integer as total_team_size,
    greatest(0, coalesce(t.total_team_size, 0) - coalesce(t.found_count, 0))::integer as remaining_spots,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'profile_id', p.id,
          'full_name', p.full_name,
          'major', p.major,
          'is_demo', p.is_demo,
          'connection_id', m.connection_id,
          'active_request_id', active_request.id
        )
        order by m.updated_at desc
      ) filter (where p.id is not null),
      '[]'::jsonb
    ) as teammates
  from totals t
  left join matched m on true
  left join public.profiles p on p.id = m.teammate_profile_id
  left join lateral (
    select tr.id
    from public.team_requests tr
    where tr.profile_id = p.id
      and tr.status = 'looking'
    order by tr.created_at desc
    limit 1
  ) active_request on true
  group by t.found_count, t.matched_count, t.existing_count, t.total_team_size;
$$;

grant execute on function public.list_my_team_requests(uuid) to anon, authenticated;
grant execute on function public.list_active_team_requests() to anon, authenticated;
grant execute on function public.get_team_request_public(uuid) to anon, authenticated;
grant execute on function public.create_team_request(uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text) to anon, authenticated;
grant execute on function public.update_team_request(uuid, uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text) to anon, authenticated;
grant execute on function public.find_receiver_team_request(uuid, uuid) to anon, authenticated;
grant execute on function public.send_connection_request(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.respond_connection_request(uuid, uuid, text) to anon, authenticated;
grant execute on function public.get_connection_between(uuid, uuid) to anon, authenticated;
grant execute on function public.list_connection_requests(uuid, text) to anon, authenticated;
grant execute on function public.get_connection_detail(uuid, uuid) to anon, authenticated;
grant execute on function public.get_team_request_progress(uuid, uuid) to anon, authenticated;
