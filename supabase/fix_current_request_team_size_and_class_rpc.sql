-- Teamergency fix: current request/team-size RPCs for the current app.
--
-- Safe for data:
-- - adds missing columns with defaults
-- - replaces stored functions only
-- - does not drop tables
-- - does not delete profiles, classes, requests, connections, or messages

create extension if not exists pgcrypto with schema extensions;

alter table public.team_requests
add column if not exists total_team_size integer,
add column if not exists teammates_needed_initial integer;

alter table public.team_requests
add column if not exists class_id uuid references public.classes(id) on delete set null;

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

create index if not exists team_requests_class_id_idx on public.team_requests(class_id);
create index if not exists team_requests_class_profile_status_idx
on public.team_requests(class_id, profile_id, status);

drop function if exists public.list_my_team_requests(uuid);
create function public.list_my_team_requests(current_profile uuid)
returns table(
  id uuid,
  profile_id uuid,
  class_id uuid,
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
    tr.class_id,
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

drop function if exists public.create_team_request(
  uuid, text, text, text, text, text, text, text[], integer, text[], jsonb, boolean, text, text, text
);
drop function if exists public.create_team_request(
  uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text
);
create function public.create_team_request(
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
set search_path = public, extensions
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
    class_id,
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
    null,
    p_school,
    trim(p_major),
    trim(p_course),
    trim(p_course_name),
    trim(p_course_code),
    trim(p_class_session),
    coalesce(p_skills_needed, '{}'::text[]),
    p_teammates_needed_initial,
    p_total_team_size,
    p_teammates_needed_initial,
    '{}'::text[],
    null,
    null,
    coalesce(p_work_styles, '{}'::text[]),
    coalesce(p_requirements_data, '{}'::jsonb),
    coalesce(p_requires_portfolio, false),
    p_portfolio_reference_path,
    p_portfolio_reference_name,
    nullif(trim(coalesce(p_requirements, '')), ''),
    'looking',
    encode(gen_random_bytes(32), 'hex')
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

drop function if exists public.create_team_request_with_class(
  uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text, uuid
);
create function public.create_team_request_with_class(
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
  p_requirements text,
  p_class_id uuid
)
returns table(
  id uuid,
  profile_id uuid,
  class_id uuid,
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
  requirements_data jsonb,
  requires_portfolio boolean,
  portfolio_reference_path text,
  portfolio_reference_name text,
  requirements text,
  status text,
  edit_token text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  selected_class public.classes;
  created_request public.team_requests;
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if p_total_team_size < 2 or p_teammates_needed_initial < 1 then
    raise exception 'Team size values are invalid.';
  end if;

  if p_teammates_needed_initial >= p_total_team_size then
    raise exception 'You cannot look for more teammates than the total team size.';
  end if;

  select c.* into selected_class
  from public.classes c
  join public.class_members cm on cm.class_id = c.id
  where c.id = p_class_id
    and c.status = 'active'
    and cm.profile_id = p_profile_id
  limit 1;

  if selected_class.id is null then
    raise exception 'Class membership required.';
  end if;

  insert into public.team_requests (
    profile_id,
    class_id,
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
    selected_class.id,
    coalesce(selected_class.school, p_school),
    coalesce(selected_class.major, p_major),
    coalesce(selected_class.course_name, p_course),
    coalesce(selected_class.course_name, p_course_name, p_course),
    coalesce(selected_class.course_code, p_course_code),
    coalesce(selected_class.class_session, p_class_session),
    coalesce(p_skills_needed, '{}'::text[]),
    p_teammates_needed_initial,
    p_total_team_size,
    p_teammates_needed_initial,
    coalesce(p_work_styles, '{}'::text[]),
    coalesce(p_requirements_data, '{}'::jsonb),
    coalesce(p_requires_portfolio, false),
    p_portfolio_reference_path,
    p_portfolio_reference_name,
    nullif(trim(coalesce(p_requirements, '')), ''),
    'looking',
    encode(gen_random_bytes(32), 'hex')
  )
  returning * into created_request;

  return query select
    created_request.id,
    created_request.profile_id,
    created_request.class_id,
    created_request.school,
    created_request.major,
    created_request.course,
    created_request.course_name,
    created_request.course_code,
    created_request.class_session,
    created_request.skills_needed,
    created_request.members_needed,
    created_request.total_team_size,
    created_request.teammates_needed_initial,
    created_request.work_styles,
    created_request.requirements_data,
    created_request.requires_portfolio,
    created_request.portfolio_reference_path,
    created_request.portfolio_reference_name,
    created_request.requirements,
    created_request.status,
    created_request.edit_token,
    created_request.created_at;
end;
$$;

drop function if exists public.update_team_request(
  uuid, uuid, text, text, text, text, text, text, text[], integer, text[], jsonb, boolean, text, text, text
);
drop function if exists public.update_team_request(
  uuid, uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text
);
create function public.update_team_request(
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
    class_id = null,
    school = p_school,
    major = trim(p_major),
    course = trim(p_course),
    course_name = trim(p_course_name),
    course_code = trim(p_course_code),
    class_session = trim(p_class_session),
    skills_needed = coalesce(p_skills_needed, '{}'::text[]),
    members_needed = p_teammates_needed_initial,
    total_team_size = p_total_team_size,
    teammates_needed_initial = p_teammates_needed_initial,
    work_styles = coalesce(p_work_styles, '{}'::text[]),
    requirements_data = coalesce(p_requirements_data, '{}'::jsonb),
    requires_portfolio = coalesce(p_requires_portfolio, false),
    portfolio_reference_path = p_portfolio_reference_path,
    portfolio_reference_name = p_portfolio_reference_name,
    requirements = nullif(trim(coalesce(p_requirements, '')), ''),
    updated_at = now()
  where tr.id = p_request_id
    and tr.profile_id = p_profile_id
    and tr.status = 'looking'
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

drop function if exists public.update_team_request_with_class(
  uuid, uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text, uuid
);
create function public.update_team_request_with_class(
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
  p_requirements text,
  p_class_id uuid
)
returns table(
  id uuid,
  profile_id uuid,
  class_id uuid,
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
  requirements_data jsonb,
  requires_portfolio boolean,
  portfolio_reference_path text,
  portfolio_reference_name text,
  requirements text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_class public.classes;
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  if p_total_team_size < 2 or p_teammates_needed_initial < 1 then
    raise exception 'Team size values are invalid.';
  end if;

  if p_teammates_needed_initial >= p_total_team_size then
    raise exception 'You cannot look for more teammates than the total team size.';
  end if;

  select c.* into selected_class
  from public.classes c
  join public.class_members cm on cm.class_id = c.id
  where c.id = p_class_id
    and c.status = 'active'
    and cm.profile_id = p_profile_id
  limit 1;

  if selected_class.id is null then
    raise exception 'Class membership required.';
  end if;

  return query
  update public.team_requests tr
  set
    class_id = selected_class.id,
    school = coalesce(selected_class.school, p_school),
    major = coalesce(selected_class.major, p_major),
    course = coalesce(selected_class.course_name, p_course),
    course_name = coalesce(selected_class.course_name, p_course_name, p_course),
    course_code = coalesce(selected_class.course_code, p_course_code),
    class_session = coalesce(selected_class.class_session, p_class_session),
    skills_needed = coalesce(p_skills_needed, '{}'::text[]),
    members_needed = p_teammates_needed_initial,
    total_team_size = p_total_team_size,
    teammates_needed_initial = p_teammates_needed_initial,
    work_styles = coalesce(p_work_styles, '{}'::text[]),
    requirements_data = coalesce(p_requirements_data, '{}'::jsonb),
    requires_portfolio = coalesce(p_requires_portfolio, false),
    portfolio_reference_path = p_portfolio_reference_path,
    portfolio_reference_name = p_portfolio_reference_name,
    requirements = nullif(trim(coalesce(p_requirements, '')), ''),
    updated_at = now()
  where tr.id = p_request_id
    and tr.profile_id = p_profile_id
    and tr.status = 'looking'
  returning
    tr.id,
    tr.profile_id,
    tr.class_id,
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
    tr.requirements_data,
    tr.requires_portfolio,
    tr.portfolio_reference_path,
    tr.portfolio_reference_name,
    tr.requirements,
    tr.status,
    tr.created_at;
end;
$$;

drop function if exists public.get_team_request_progress(uuid, uuid);
create function public.get_team_request_progress(
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
      and c.relationship_type = 'teammate'
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
    coalesce(t.found_count, 0)::integer,
    coalesce(t.matched_count, 0)::integer,
    coalesce(t.existing_count, 0)::integer,
    coalesce(t.total_team_size, 0)::integer,
    greatest(0, coalesce(t.total_team_size, 0) - coalesce(t.found_count, 0))::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'profile_id', p.id,
          'full_name', p.full_name,
          'major', p.major,
          'skills', p.skills,
          'is_demo', p.is_demo,
          'connection_id', m.connection_id,
          'active_request_id', active_request.id
        )
        order by m.updated_at desc
      ) filter (where p.id is not null),
      '[]'::jsonb
    )
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

grant execute on function public.list_my_team_requests(uuid) to authenticated;
grant execute on function public.create_team_request(uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text) to authenticated;
grant execute on function public.create_team_request_with_class(uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text, uuid) to authenticated;
grant execute on function public.update_team_request(uuid, uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text) to authenticated;
grant execute on function public.update_team_request_with_class(uuid, uuid, text, text, text, text, text, text, text[], integer, integer, integer, text[], jsonb, boolean, text, text, text, uuid) to authenticated;
grant execute on function public.get_team_request_progress(uuid, uuid) to authenticated;
