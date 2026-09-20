-- Allow any owned profile to join a valid active class code, regardless of
-- university, school, or major. Run manually in the production project.

create or replace function public.join_class_by_id(
  current_profile uuid,
  target_class uuid,
  preferred_teammate_status text default null
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
  profile_row public.profiles;
  member_row public.class_members;
begin
  if not public.owns_profile(current_profile) then
    raise exception 'Profile ownership required.';
  end if;

  select p.*
    into profile_row
  from public.profiles p
  where p.id = current_profile
  limit 1;

  select c.*
    into selected_class
  from public.classes c
  where c.id = target_class
    and c.status = 'active'
  limit 1;

  if selected_class.id is null then
    raise exception 'Class not found or inactive.';
  end if;

  if preferred_teammate_status is not null
    and preferred_teammate_status not in (
      'already_have_team',
      'need_some_teammates',
      'no_preferred_teammates'
    )
  then
    raise exception 'Invalid network status.';
  end if;

  insert into public.class_members (
    class_id,
    profile_id,
    network_status
  )
  values (
    selected_class.id,
    current_profile,
    preferred_teammate_status
  )
  on conflict (class_id, profile_id)
  do update set network_status = excluded.network_status
  returning * into member_row;

  return query
  select
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
      'class_code', coalesce(selected_class.lecturer_access_code, selected_class.join_code),
      'join_code', selected_class.join_code,
      'status', selected_class.status,
      'is_demo', selected_class.is_demo,
      'formation_status', selected_class.formation_status,
      'required_members_per_team', selected_class.required_members_per_team,
      'team_formation_deadline', selected_class.team_formation_deadline,
      'approximate_student_count', selected_class.approximate_student_count
    );
end;
$$;

revoke all on function public.join_class_by_id(uuid, uuid, text) from public;
grant execute on function public.join_class_by_id(uuid, uuid, text) to authenticated;
