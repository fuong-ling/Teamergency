create extension if not exists pgcrypto with schema extensions;

drop function if exists public.create_team_request(
  uuid, text, text, text, text, text, text, text[], integer, text[], jsonb, boolean, text, text, text
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

  if p_members_needed < 1 then
    raise exception 'Members needed must be greater than zero.';
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
    p_members_needed,
    '{}',
    null,
    null,
    coalesce(p_work_styles, '{}'),
    coalesce(p_requirements_data, '{}'::jsonb),
    coalesce(p_requires_portfolio, false),
    p_portfolio_reference_path,
    p_portfolio_reference_name,
    nullif(trim(p_requirements), ''),
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

grant execute on function public.create_team_request(uuid, text, text, text, text, text, text, text[], integer, text[], jsonb, boolean, text, text, text) to authenticated;
