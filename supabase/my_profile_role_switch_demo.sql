-- Teamergency MVP: My Profile role switching and demo lecturer access.
-- Safe additive migration. It does not drop tables, reset data, or delete real user data.

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
add column if not exists role text not null default 'student';

alter table public.profiles
add column if not exists lecturer_title text;

update public.profiles
set role = 'student'
where role is null
  or role not in ('student', 'lecturer');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_role_check'
  ) then
    alter table public.profiles
    add constraint profiles_role_check check (role in ('student', 'lecturer'));
  end if;
end;
$$;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  university text not null default 'RMIT University',
  school text,
  major text not null check (length(trim(major)) > 0),
  course text not null check (length(trim(course)) > 0),
  course_name text not null check (length(trim(course_name)) > 0),
  course_code text not null check (length(trim(course_code)) > 0),
  session_code text not null check (session_code ~ '^[0-9]{2}$'),
  class_session text not null,
  semester text not null default 'Semester 2',
  academic_year integer not null default 2026,
  lecturer_name text,
  join_code text not null unique,
  status text not null default 'active' check (status in ('active', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.classes
add column if not exists is_demo boolean not null default false;

alter table public.classes
add column if not exists lecturer_id text;

alter table public.classes
add column if not exists demo_class_code text;

create table if not exists public.class_members (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  network_status text check (
    network_status is null
    or network_status in ('already_have_team', 'need_some_teammates', 'no_preferred_teammates')
  ),
  joined_at timestamptz not null default now(),
  unique (class_id, profile_id)
);

alter table public.team_requests
add column if not exists class_id uuid references public.classes(id) on delete set null;

create index if not exists classes_is_demo_idx on public.classes(is_demo);
create index if not exists classes_demo_class_code_idx on public.classes(demo_class_code);
create index if not exists classes_lecturer_id_idx on public.classes(lecturer_id);
create index if not exists class_members_class_id_idx on public.class_members(class_id);
create index if not exists class_members_profile_id_idx on public.class_members(profile_id);
create index if not exists team_requests_class_id_idx on public.team_requests(class_id);

alter table public.classes enable row level security;
alter table public.class_members enable row level security;

drop policy if exists "Authenticated can read active classes" on public.classes;
create policy "Authenticated can read active classes"
on public.classes
for select
to authenticated
using (
  status = 'active'
  or owner_id = auth.uid()
  or is_demo = true
  or exists (
    select 1
    from public.class_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.class_id = classes.id
      and p.owner_id = auth.uid()
  )
);

drop policy if exists "Authenticated can read own class memberships" on public.class_members;
create policy "Authenticated can read own class memberships"
on public.class_members
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = class_members.profile_id
      and p.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.classes c
    where c.id = class_members.class_id
      and (c.owner_id = auth.uid() or c.is_demo = true)
  )
);

revoke all on public.classes from anon;
revoke all on public.class_members from anon;
grant select on public.classes to authenticated;
grant select, insert on public.class_members to authenticated;

create or replace function public.update_profile_with_role(
  p_profile_id uuid,
  p_university text,
  p_school text,
  p_major text,
  p_full_name text,
  p_skills text[],
  p_contact_type text,
  p_contact_value text,
  p_short_bio text,
  p_is_available boolean,
  p_role text,
  p_lecturer_title text
)
returns setof public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_role text;
begin
  if not public.owns_profile(p_profile_id) then
    raise exception 'Profile ownership required.';
  end if;

  normalized_role := case when p_role = 'lecturer' then 'lecturer' else 'student' end;

  return query
  update public.profiles p
  set
    university = coalesce(nullif(trim(p_university), ''), 'RMIT University'),
    school = trim(p_school),
    major = trim(p_major),
    full_name = trim(p_full_name),
    skills = coalesce(p_skills, '{}'::text[]),
    contact_type = p_contact_type,
    contact_value = nullif(trim(coalesce(p_contact_value, '')), ''),
    short_bio = nullif(trim(coalesce(p_short_bio, '')), ''),
    is_available = coalesce(p_is_available, true),
    role = normalized_role,
    lecturer_title = case
      when normalized_role = 'lecturer' then nullif(trim(coalesce(p_lecturer_title, '')), '')
      else null
    end
  where p.id = p_profile_id
    and p.is_demo = false
  returning p.*;
end;
$$;

with demo_classes (
  demo_class_code,
  lecturer_id,
  university,
  lecturer_name,
  school,
  major,
  course_name,
  course_code,
  session_code
) as (
  values
    ('200206', 'v123456', 'RMIT University', 'Tom Anderson', 'SCD', 'Digital Media', 'Digital Media Studio 4', 'COMM2784', '01'),
    ('200206', 'v123456', 'RMIT University', 'Tom Anderson', 'TBS', 'Business', 'Integrated Marketing Campaign', 'MKTG2301', '01'),
    ('200206', 'v123456', 'RMIT University', 'Tom Anderson', 'SSET', 'Information Technology', 'Web Programming', 'COSC2430', '01'),
    ('676767', 'v654321', 'University of Economics Ho Chi Minh City', 'Minh Nguyen', 'SCD', 'Design Studies', 'Brand Identity Studio', 'COMM2762', '02'),
    ('676767', 'v654321', 'University of Economics Ho Chi Minh City', 'Minh Nguyen', 'TBS', 'Marketing', 'Integrated Marketing Campaign', 'MKTG2301', '02'),
    ('676767', 'v654321', 'University of Economics Ho Chi Minh City', 'Minh Nguyen', 'SSET', 'Software Engineering', 'Service Design', 'ISYS2101', '01'),
    ('88889999', 'v888888', 'University of Technology Ho Chi Minh City', 'Sarah Tran', 'SCD', 'Digital Film and Video', 'Digital Storytelling', 'COMM2750', '01'),
    ('88889999', 'v888888', 'University of Technology Ho Chi Minh City', 'Sarah Tran', 'TBS', 'Business Analytics', 'Data Storytelling', 'BUSM2655', '01'),
    ('88889999', 'v888888', 'University of Technology Ho Chi Minh City', 'Sarah Tran', 'SSET', 'Computer Science', 'Creative Coding', 'COSC2818', '02')
)
insert into public.classes (
  university,
  school,
  major,
  course,
  course_name,
  course_code,
  session_code,
  class_session,
  semester,
  academic_year,
  lecturer_name,
  join_code,
  status,
  is_demo,
  lecturer_id,
  demo_class_code
)
select
  d.university,
  d.school,
  d.major,
  d.course_name,
  d.course_name,
  d.course_code,
  d.session_code,
  'Session ' || d.session_code,
  'Semester 2',
  2026,
  d.lecturer_name,
  d.demo_class_code || '-' || d.school,
  'active',
  true,
  d.lecturer_id,
  d.demo_class_code
from demo_classes d
on conflict (join_code) do update
set
  university = excluded.university,
  school = excluded.school,
  major = excluded.major,
  course = excluded.course,
  course_name = excluded.course_name,
  course_code = excluded.course_code,
  session_code = excluded.session_code,
  class_session = excluded.class_session,
  semester = excluded.semester,
  academic_year = excluded.academic_year,
  lecturer_name = excluded.lecturer_name,
  status = 'active',
  is_demo = true,
  lecturer_id = excluded.lecturer_id,
  demo_class_code = excluded.demo_class_code;

with demo_members (demo_class_code, school, full_name, network_status) as (
  values
    ('200206', 'SCD', 'Alex Nguyen', 'need_some_teammates'),
    ('200206', 'SCD', 'Jamie Vo', 'no_preferred_teammates'),
    ('200206', 'SCD', 'Hana Le', 'already_have_team'),
    ('200206', 'SCD', 'Duc Lam', 'need_some_teammates'),
    ('200206', 'TBS', 'An Nguyen', 'already_have_team'),
    ('200206', 'TBS', 'Mai Hoang', 'need_some_teammates'),
    ('200206', 'SSET', 'Bao Le', 'need_some_teammates'),
    ('200206', 'SSET', 'Tuan Huynh', 'no_preferred_teammates'),
    ('676767', 'SCD', 'Linh Pham', 'need_some_teammates'),
    ('676767', 'SCD', 'Huy Vo', 'no_preferred_teammates'),
    ('676767', 'TBS', 'Mai Hoang', 'need_some_teammates'),
    ('676767', 'TBS', 'Quynh Tran', 'no_preferred_teammates'),
    ('676767', 'SSET', 'Nam Phan', 'already_have_team'),
    ('676767', 'SSET', 'Bao Le', 'need_some_teammates'),
    ('88889999', 'SCD', 'Yen Mai', 'need_some_teammates'),
    ('88889999', 'SCD', 'Vy Dang', 'already_have_team'),
    ('88889999', 'TBS', 'Quynh Tran', 'need_some_teammates'),
    ('88889999', 'TBS', 'An Nguyen', 'already_have_team'),
    ('88889999', 'SSET', 'Khoa Bui', 'no_preferred_teammates'),
    ('88889999', 'SSET', 'Tuan Huynh', 'need_some_teammates')
)
insert into public.class_members (class_id, profile_id, network_status)
select
  c.id,
  p.id,
  dm.network_status
from demo_members dm
join public.classes c
  on c.demo_class_code = dm.demo_class_code
 and c.school = dm.school
 and c.is_demo = true
join public.profiles p
  on p.full_name = dm.full_name
 and p.is_demo = true
on conflict (class_id, profile_id)
do update set network_status = excluded.network_status;

update public.team_requests tr
set class_id = c.id
from public.classes c
where c.is_demo = true
  and tr.class_id is null
  and tr.course_code = c.course_code
  and tr.class_session = c.class_session
  and exists (
    select 1
    from public.class_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.class_id = c.id
      and cm.profile_id = tr.profile_id
      and p.is_demo = true
  );

create or replace function public.demo_class_average_match_usefulness(target_class uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  average_value numeric := 0;
begin
  if to_regclass('public.match_feedback') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'match_feedback'
        and column_name = 'usefulness_rating'
    )
  then
    execute $sql$
      select avg(mf.usefulness_rating)::numeric
      from public.team_requests tr
      join public.match_feedback mf on mf.team_request_id = tr.id
      where tr.class_id = $1
    $sql$
    into average_value
    using target_class;
  end if;

  return round(coalesce(average_value, 0), 1);
end;
$$;

create or replace function public.demo_class_dashboard_row(target_class uuid)
returns table(
  id uuid,
  university text,
  school text,
  major text,
  course_name text,
  course_code text,
  session_code text,
  semester text,
  academic_year integer,
  lecturer_name text,
  lecturer_id text,
  class_code text,
  join_code text,
  status text,
  total_students integer,
  students_looking integer,
  students_in_teams integer,
  students_without_team integer,
  teams_formed integer,
  formation_rate numeric,
  average_match_usefulness numeric,
  network_status_counts jsonb,
  students jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.university,
    c.school,
    c.major,
    c.course_name,
    c.course_code,
    c.session_code,
    c.semester,
    c.academic_year,
    c.lecturer_name,
    c.lecturer_id,
    coalesce(c.demo_class_code, c.join_code),
    c.join_code,
    c.status,
    (
      select count(*)::integer
      from public.class_members cm
      where cm.class_id = c.id
    ),
    (
      select count(distinct tr.profile_id)::integer
      from public.team_requests tr
      where tr.class_id = c.id
        and tr.status = 'looking'
    ),
    (
      select count(distinct cm.profile_id)::integer
      from public.class_members cm
      where cm.class_id = c.id
        and (
          cm.network_status = 'already_have_team'
          or exists (
            select 1
            from public.team_requests tr
            where tr.class_id = c.id
              and tr.profile_id = cm.profile_id
              and tr.status = 'found'
          )
        )
    ),
    (
      select count(*)::integer
      from public.class_members cm
      where cm.class_id = c.id
        and cm.network_status is distinct from 'already_have_team'
        and not exists (
          select 1
          from public.team_requests tr
          where tr.class_id = c.id
            and tr.profile_id = cm.profile_id
            and tr.status = 'found'
        )
    ),
    (
      select ceiling(count(distinct cm.profile_id)::numeric / 2)::integer
      from public.class_members cm
      where cm.class_id = c.id
        and (
          cm.network_status = 'already_have_team'
          or exists (
            select 1
            from public.team_requests tr
            where tr.class_id = c.id
              and tr.profile_id = cm.profile_id
              and tr.status = 'found'
          )
        )
    ),
    (
      select case
        when count(*) = 0 then 0
        else round((
          count(*) filter (
            where cm.network_status = 'already_have_team'
              or exists (
                select 1
                from public.team_requests tr
                where tr.class_id = c.id
                  and tr.profile_id = cm.profile_id
                  and tr.status = 'found'
              )
          )::numeric / count(*)::numeric
        ) * 100, 1)
      end
      from public.class_members cm
      where cm.class_id = c.id
    ),
    public.demo_class_average_match_usefulness(c.id),
    coalesce((
      select jsonb_object_agg(coalesce(network_status, 'not_answered'), total)
      from (
        select cm.network_status, count(*)::integer as total
        from public.class_members cm
        where cm.class_id = c.id
        group by cm.network_status
      ) grouped_statuses
    ), '{}'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'profile_id', p.id,
          'full_name', p.full_name,
          'major', p.major,
          'network_status', cm.network_status,
          'status', case
            when cm.network_status = 'already_have_team'
              or exists (
                select 1
                from public.team_requests tr
                where tr.class_id = c.id
                  and tr.profile_id = cm.profile_id
                  and tr.status = 'found'
              )
              then 'Team formed'
            when exists (
              select 1
              from public.team_requests tr
              where tr.class_id = c.id
                and tr.profile_id = cm.profile_id
                and tr.status = 'looking'
            )
              then 'Looking for team'
            when cm.network_status = 'no_preferred_teammates'
              then 'Needs help'
            else 'Matched'
          end
        )
        order by p.full_name
      )
      from public.class_members cm
      join public.profiles p on p.id = cm.profile_id
      where cm.class_id = c.id
    ), '[]'::jsonb)
  from public.classes c
  where c.id = target_class
    and c.is_demo = true
    and c.status = 'active';
$$;

create or replace function public.get_demo_lecturer_dashboards(
  p_university text,
  p_lecturer_id text
)
returns table(
  id uuid,
  university text,
  school text,
  major text,
  course_name text,
  course_code text,
  session_code text,
  semester text,
  academic_year integer,
  lecturer_name text,
  lecturer_id text,
  class_code text,
  join_code text,
  status text,
  total_students integer,
  students_looking integer,
  students_in_teams integer,
  students_without_team integer,
  teams_formed integer,
  formation_rate numeric,
  average_match_usefulness numeric,
  network_status_counts jsonb,
  students jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select dashboard.*
  from public.classes c
  cross join lateral public.demo_class_dashboard_row(c.id) dashboard
  where c.is_demo = true
    and c.status = 'active'
    and lower(c.university) = lower(trim(p_university))
    and lower(c.lecturer_id) = lower(trim(p_lecturer_id))
  order by c.school, c.course_name, c.session_code;
$$;

create or replace function public.get_demo_class_for_profile(
  current_profile uuid,
  p_class_code text
)
returns table(
  id uuid,
  university text,
  school text,
  major text,
  course text,
  course_name text,
  course_code text,
  session_code text,
  class_session text,
  semester text,
  academic_year integer,
  lecturer_name text,
  lecturer_id text,
  class_code text,
  join_code text,
  status text,
  is_demo boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.university,
    c.school,
    c.major,
    c.course,
    c.course_name,
    c.course_code,
    c.session_code,
    c.class_session,
    c.semester,
    c.academic_year,
    c.lecturer_name,
    c.lecturer_id,
    coalesce(c.demo_class_code, c.join_code),
    c.join_code,
    c.status,
    c.is_demo
  from public.profiles p
  join public.classes c
    on c.is_demo = true
   and c.status = 'active'
   and coalesce(c.demo_class_code, c.join_code) = trim(p_class_code)
   and (c.major = p.major or c.school = p.school)
  where p.id = current_profile
    and public.owns_profile(current_profile)
  order by
    case when c.major = p.major then 0 else 1 end,
    c.course_name
  limit 1;
$$;

create or replace function public.join_demo_class_by_code(
  current_profile uuid,
  p_class_code text,
  preferred_teammate_status text
)
returns table(
  id uuid,
  class_id uuid,
  profile_id uuid,
  network_status text,
  joined_at timestamptz,
  class_data jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_class public.classes;
  member_row public.class_members;
begin
  if not public.owns_profile(current_profile) then
    raise exception 'Profile ownership required.';
  end if;

  select c.* into selected_class
  from public.get_demo_class_for_profile(current_profile, p_class_code) dc
  join public.classes c on c.id = dc.id
  limit 1;

  if selected_class.id is null then
    raise exception 'Class code not found for this profile.';
  end if;

  if preferred_teammate_status is not null
    and preferred_teammate_status not in ('already_have_team', 'need_some_teammates', 'no_preferred_teammates')
  then
    raise exception 'Invalid network status.';
  end if;

  update public.class_members cm
  set network_status = preferred_teammate_status
  where cm.class_id = selected_class.id
    and cm.profile_id = current_profile
  returning cm.* into member_row;

  if member_row.id is null then
    insert into public.class_members (class_id, profile_id, network_status)
    values (selected_class.id, current_profile, preferred_teammate_status)
    returning * into member_row;
  end if;

  return query select
    member_row.id,
    member_row.class_id,
    member_row.profile_id,
    member_row.network_status,
    member_row.joined_at,
    jsonb_build_object(
      'id', selected_class.id,
      'university', selected_class.university,
      'school', selected_class.school,
      'major', selected_class.major,
      'course', selected_class.course,
      'course_name', selected_class.course_name,
      'course_code', selected_class.course_code,
      'session_code', selected_class.session_code,
      'class_session', selected_class.class_session,
      'semester', selected_class.semester,
      'academic_year', selected_class.academic_year,
      'lecturer_name', selected_class.lecturer_name,
      'lecturer_id', selected_class.lecturer_id,
      'class_code', coalesce(selected_class.demo_class_code, selected_class.join_code),
      'join_code', selected_class.join_code,
      'status', selected_class.status,
      'is_demo', selected_class.is_demo
    );
end;
$$;

grant execute on function public.demo_class_average_match_usefulness(uuid) to authenticated;
grant execute on function public.demo_class_dashboard_row(uuid) to authenticated;
grant execute on function public.get_demo_lecturer_dashboards(text, text) to authenticated;
grant execute on function public.get_demo_class_for_profile(uuid, text) to authenticated;
grant execute on function public.join_demo_class_by_code(uuid, text, text) to authenticated;
grant execute on function public.update_profile_with_role(uuid, text, text, text, text, text[], text, text, text, boolean, text, text) to authenticated;
