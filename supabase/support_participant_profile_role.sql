-- Support Participant profiles without academic institution fields.
-- Run manually in Supabase; do not execute automatically.

alter table public.profiles
  alter column major drop not null;

create or replace function public.update_profile_with_role_v2(
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
  p_lecturer_title text,
  p_student_id text,
  p_academic_field text,
  p_lecturer_id text,
  p_lecturer_contact_method text,
  p_lecturer_contact_detail text
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

  normalized_role := case
    when p_role = 'lecturer' then 'lecturer'
    when p_role = 'participant' then 'participant'
    else 'student'
  end;

  return query
  update public.profiles p
  set
    university = case
      when normalized_role = 'participant' then null
      else coalesce(nullif(trim(p_university), ''), 'RMIT University')
    end,
    school = case
      when normalized_role = 'participant' then null
      else nullif(trim(coalesce(p_school, '')), '')
    end,
    major = case
      when normalized_role = 'participant' then null
      else nullif(trim(coalesce(p_major, '')), '')
    end,
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
    end,
    student_id = case
      when normalized_role = 'student' then nullif(trim(coalesce(p_student_id, '')), '')
      else null
    end,
    academic_field = case
      when normalized_role = 'lecturer' then nullif(trim(coalesce(p_academic_field, '')), '')
      else null
    end,
    lecturer_id = case
      when normalized_role = 'lecturer' then nullif(trim(coalesce(p_lecturer_id, '')), '')
      else null
    end,
    lecturer_contact_method = case
      when normalized_role = 'lecturer' then p_lecturer_contact_method
      else null
    end,
    lecturer_contact_detail = case
      when normalized_role = 'lecturer' then nullif(trim(coalesce(p_lecturer_contact_detail, '')), '')
      else null
    end
  where p.id = p_profile_id
    and p.is_demo = false
  returning p.*;
end;
$$;

revoke all on function public.update_profile_with_role_v2(
  uuid,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.update_profile_with_role_v2(
  uuid,
  text,
  text,
  text,
  text,
  text[],
  text,
  text,
  text,
  boolean,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;
