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
  order by c.course_name
  limit 1;
$$;

grant execute on function public.get_demo_class_for_profile_v2(uuid, text) to authenticated;
