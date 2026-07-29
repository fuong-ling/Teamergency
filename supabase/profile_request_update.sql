alter table public.team_requests
add column if not exists work_styles text[] not null default '{}';

alter table public.team_requests
add column if not exists requirements_data jsonb not null default '{}'::jsonb;

create index if not exists team_requests_work_styles_gin_idx
on public.team_requests using gin(work_styles);

create index if not exists team_requests_requirements_data_gin_idx
on public.team_requests using gin(requirements_data);

create or replace function public.update_profile(
  p_profile_id uuid,
  p_full_name text,
  p_school text,
  p_major text,
  p_skills text[],
  p_contact_type text,
  p_contact_value text,
  p_short_bio text
)
returns table(
  id uuid,
  full_name text,
  school text,
  major text,
  skills text[],
  contact_type text,
  contact_value text,
  short_bio text,
  is_demo boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.profiles p
  set
    full_name = trim(p_full_name),
    school = trim(p_school),
    major = trim(p_major),
    skills = p_skills,
    contact_type = p_contact_type,
    contact_value = trim(p_contact_value),
    short_bio = trim(p_short_bio)
  where p.id = p_profile_id
    and p.is_demo = false
  returning
    p.id,
    p.full_name,
    p.school,
    p.major,
    p.skills,
    p.contact_type,
    p.contact_value,
    p.short_bio,
    p.is_demo,
    p.created_at;
end;
$$;

revoke all on function public.update_profile(uuid, text, text, text, text[], text, text, text) from public;
grant execute on function public.update_profile(uuid, text, text, text, text[], text, text, text) to anon;
