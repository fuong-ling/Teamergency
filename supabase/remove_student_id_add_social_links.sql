-- Teamergency profile privacy update.
-- Run manually in Supabase SQL Editor.
-- This preserves existing profile data and does not delete student_id values.

alter table public.profiles
add column if not exists social_links jsonb not null default '{}'::jsonb;

alter table public.profiles
drop constraint if exists profiles_contact_value_required_for_real_users;

alter table public.profiles
drop constraint if exists profiles_contact_value_optional_check;

alter table public.profiles
add constraint profiles_contact_value_optional_check
check (
  contact_value is null
  or length(trim(contact_value)) > 0
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'student_id'
  ) then
    alter table public.profiles
    alter column student_id drop not null;
  end if;
end $$;

create or replace function public.public_profile_json(profile_row public.profiles)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', profile_row.id,
    'full_name', profile_row.full_name,
    'university', profile_row.university,
    'school', profile_row.school,
    'major', profile_row.major,
    'skills', profile_row.skills,
    'contact_type', null,
    'contact_value', null,
    'social_links', coalesce(profile_row.social_links, '{}'::jsonb),
    'short_bio', profile_row.short_bio,
    'is_demo', profile_row.is_demo,
    'is_available', profile_row.is_available,
    'subscription_status', profile_row.subscription_status,
    'created_at', profile_row.created_at,
    'consent_public_visibility', profile_row.consent_public_visibility,
    'review_summary', public.review_summary(profile_row.id)
  );
$$;

drop function if exists public.list_public_profiles();

create function public.list_public_profiles()
returns table(
  id uuid,
  full_name text,
  school text,
  major text,
  skills text[],
  contact_type text,
  contact_value text,
  social_links jsonb,
  short_bio text,
  is_demo boolean,
  created_at timestamptz,
  consent_public_visibility boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.school,
    p.major,
    p.skills,
    null::text as contact_type,
    null::text as contact_value,
    coalesce(p.social_links, '{}'::jsonb) as social_links,
    p.short_bio,
    p.is_demo,
    p.created_at,
    p.consent_public_visibility
  from public.profiles p
  where p.is_demo = true
     or p.consent_public_visibility = true
     or p.owner_id = auth.uid()
  order by p.created_at desc;
$$;

drop function if exists public.get_public_profile(uuid);

create function public.get_public_profile(requested_profile uuid)
returns table(
  id uuid,
  full_name text,
  school text,
  major text,
  skills text[],
  contact_type text,
  contact_value text,
  social_links jsonb,
  short_bio text,
  is_demo boolean,
  created_at timestamptz,
  consent_public_visibility boolean
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.school,
    p.major,
    p.skills,
    null::text as contact_type,
    null::text as contact_value,
    coalesce(p.social_links, '{}'::jsonb) as social_links,
    p.short_bio,
    p.is_demo,
    p.created_at,
    p.consent_public_visibility
  from public.profiles p
  where p.id = requested_profile
    and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
  limit 1;
$$;

revoke all on function public.public_profile_json(public.profiles) from public, anon;
revoke all on function public.list_public_profiles() from public, anon;
revoke all on function public.get_public_profile(uuid) from public, anon;

grant execute on function public.public_profile_json(public.profiles) to anon, authenticated;
grant execute on function public.list_public_profiles() to anon, authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
