-- Teamergency fix: allow any owned student profile to preview/join a class by valid class code.
-- This only replaces the demo class lookup function. It does not alter tables,
-- reset data, delete memberships, or change profile university/school/major data.

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
  where p.id = current_profile
    and public.owns_profile(current_profile)
    and coalesce(p.role, 'student') = 'student'
  order by c.course_name
  limit 1;
$$;

grant execute on function public.get_demo_class_for_profile(uuid, text) to authenticated;

drop function if exists public.get_demo_class_for_profile_v2(uuid, text);

create or replace function public.get_demo_class_for_profile_v2(
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
  where p.id = current_profile
    and public.owns_profile(current_profile)
    and coalesce(p.role, 'student') = 'student'
  order by c.course_name
  limit 1;
$$;

grant execute on function public.get_demo_class_for_profile_v2(uuid, text) to authenticated;

drop function if exists public.join_demo_class_by_code(uuid, text, text);

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

  if not exists (
    select 1
    from public.profiles p
    where p.id = current_profile
      and coalesce(p.role, 'student') = 'student'
  ) then
    raise exception 'Student profile required.';
  end if;

  select c.* into selected_class
  from public.classes c
  where c.is_demo = true
    and c.status = 'active'
    and coalesce(c.demo_class_code, c.join_code) = trim(p_class_code)
  order by c.course_name
  limit 1;

  if selected_class.id is null then
    raise exception 'Class code not found.';
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

grant execute on function public.join_demo_class_by_code(uuid, text, text) to authenticated;
