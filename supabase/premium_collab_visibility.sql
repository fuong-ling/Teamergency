-- Teamergency MVP: additive premium/collab visibility fields.
-- Safe to run on an existing Supabase project. This does not delete or rewrite
-- existing profiles, requests, connections, messages, or class data.

alter table if exists public.profiles
  add column if not exists subscription_status text not null default 'free';

alter table if exists public.team_requests
  add column if not exists pinned_until timestamptz;

alter table if exists public.profiles
  drop constraint if exists profiles_subscription_status_check;

alter table if exists public.profiles
  add constraint profiles_subscription_status_check
  check (subscription_status in ('free', 'paid', 'premium'));

create index if not exists team_requests_pinned_until_idx
on public.team_requests (pinned_until desc)
where pinned_until is not null;

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
    'contact_type', case
      when profile_row.is_demo then null
      when public.owns_profile(profile_row.id) or public.has_accepted_connection_with_profile(profile_row.id) then profile_row.contact_type
      else null
    end,
    'contact_value', case
      when profile_row.is_demo then null
      when public.owns_profile(profile_row.id) or public.has_accepted_connection_with_profile(profile_row.id) then profile_row.contact_value
      else null
    end,
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
  university text,
  school text,
  major text,
  skills text[],
  contact_type text,
  contact_value text,
  short_bio text,
  is_demo boolean,
  is_available boolean,
  subscription_status text,
  created_at timestamptz,
  consent_public_visibility boolean,
  review_summary jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.university,
    p.school,
    p.major,
    p.skills,
    case
      when p.is_demo then null
      when public.owns_profile(p.id) or public.has_accepted_connection_with_profile(p.id) then p.contact_type
      else null
    end as contact_type,
    case
      when p.is_demo then null
      when public.owns_profile(p.id) or public.has_accepted_connection_with_profile(p.id) then p.contact_value
      else null
    end as contact_value,
    p.short_bio,
    p.is_demo,
    p.is_available,
    p.subscription_status,
    p.created_at,
    p.consent_public_visibility,
    public.review_summary(p.id) as review_summary
  from public.profiles p
  where (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
    and (p.is_available = true or p.owner_id = auth.uid())
  order by p.is_demo asc, p.created_at desc;
$$;

drop function if exists public.get_public_profile(uuid);
create function public.get_public_profile(requested_profile uuid)
returns table(
  id uuid,
  full_name text,
  university text,
  school text,
  major text,
  skills text[],
  contact_type text,
  contact_value text,
  short_bio text,
  is_demo boolean,
  is_available boolean,
  subscription_status text,
  created_at timestamptz,
  consent_public_visibility boolean,
  review_summary jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.university,
    p.school,
    p.major,
    p.skills,
    case
      when p.is_demo then null
      when public.owns_profile(p.id) or public.has_accepted_connection_with_profile(p.id) then p.contact_type
      else null
    end as contact_type,
    case
      when p.is_demo then null
      when public.owns_profile(p.id) or public.has_accepted_connection_with_profile(p.id) then p.contact_value
      else null
    end as contact_value,
    p.short_bio,
    p.is_demo,
    p.is_available,
    p.subscription_status,
    p.created_at,
    p.consent_public_visibility,
    public.review_summary(p.id) as review_summary
  from public.profiles p
  where p.id = requested_profile
    and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
  limit 1;
$$;

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
  request_scope text,
  opportunity_type text,
  opportunity_field text,
  opportunity_name text,
  deadline date,
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
  pinned_until timestamptz,
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
    tr.request_scope,
    tr.opportunity_type,
    tr.opportunity_field,
    tr.opportunity_name,
    tr.deadline,
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
    tr.pinned_until,
    tr.status,
    tr.created_at,
    tr.updated_at
  from public.team_requests tr
  where tr.profile_id = current_profile
    and public.owns_profile(current_profile)
  order by
    case when tr.pinned_until > now() then 0 else 1 end,
    case tr.status
      when 'looking' then 1
      when 'found' then 2
      when 'cancelled' then 3
      else 4
    end,
    tr.created_at desc;
$$;

drop function if exists public.get_team_request_public_v2(uuid);
create function public.get_team_request_public_v2(requested_request uuid)
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
  request_scope text,
  opportunity_type text,
  opportunity_field text,
  opportunity_name text,
  deadline date,
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
  pinned_until timestamptz,
  status text,
  created_at timestamptz,
  profile jsonb,
  team_status jsonb
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
    tr.request_scope,
    tr.opportunity_type,
    tr.opportunity_field,
    tr.opportunity_name,
    tr.deadline,
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
    tr.pinned_until,
    tr.status,
    tr.created_at,
    public.public_profile_json(p) as profile,
    public.request_team_status_json_v2(tr) as team_status
  from public.team_requests tr
  join public.profiles p on p.id = tr.profile_id
  where tr.id = requested_request
    and (tr.status = 'looking' or p.owner_id = auth.uid())
    and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
  limit 1;
$$;

drop function if exists public.list_active_team_requests_v2();
create function public.list_active_team_requests_v2()
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
  request_scope text,
  opportunity_type text,
  opportunity_field text,
  opportunity_name text,
  deadline date,
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
  pinned_until timestamptz,
  status text,
  created_at timestamptz,
  profile jsonb,
  team_status jsonb
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
    tr.request_scope,
    tr.opportunity_type,
    tr.opportunity_field,
    tr.opportunity_name,
    tr.deadline,
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
    tr.pinned_until,
    tr.status,
    tr.created_at,
    public.public_profile_json(p) as profile,
    public.request_team_status_json_v2(tr) as team_status
  from public.team_requests tr
  join public.profiles p on p.id = tr.profile_id
  left join public.classes c on c.id = tr.class_id
  where tr.status = 'looking'
    and (tr.class_id is null or coalesce(c.formation_status, 'active') <> 'formation_complete')
    and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
    and (p.is_available = true or p.owner_id = auth.uid())
    and coalesce((public.request_team_status_json_v2(tr)->>'remaining_members')::integer, tr.members_needed, 1) > 0
  order by
    case when tr.pinned_until > now() then 0 else 1 end,
    tr.created_at desc;
$$;

drop function if exists public.get_match_candidates_for_request_v2(uuid, uuid);
create function public.get_match_candidates_for_request_v2(
  requested_request uuid,
  current_profile uuid
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
  request_scope text,
  opportunity_type text,
  opportunity_field text,
  opportunity_name text,
  deadline date,
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
  pinned_until timestamptz,
  status text,
  created_at timestamptz,
  profile jsonb,
  team_status jsonb
)
language sql
security definer
set search_path = public
as $$
  with current_request as (
    select tr.*, p.university
    from public.team_requests tr
    join public.profiles p on p.id = tr.profile_id
    where tr.id = requested_request
      and tr.profile_id = current_profile
      and tr.status = 'looking'
      and public.owns_profile(current_profile)
  ),
  candidates as (
    select candidate.*
    from current_request cr
    join public.team_requests candidate on candidate.status = 'looking'
    join public.profiles p on p.id = candidate.profile_id
    left join public.classes candidate_class on candidate_class.id = candidate.class_id
    where candidate.id <> cr.id
      and candidate.profile_id <> cr.profile_id
      and (p.is_demo = true or p.consent_public_visibility = true or p.owner_id = auth.uid())
      and (p.is_available = true or p.owner_id = auth.uid())
      and coalesce((public.request_team_status_json_v2(candidate)->>'remaining_members')::integer, candidate.members_needed, 1) > 0
      and (
        (
          cr.class_id is not null
          and candidate.class_id = cr.class_id
          and coalesce(candidate_class.formation_status, 'active') <> 'formation_complete'
          and exists (
            select 1 from public.class_members cm
            where cm.class_id = cr.class_id
              and cm.profile_id = candidate.profile_id
          )
        )
        or (
          cr.class_id is null
          and coalesce(cr.request_scope, 'class') = 'open_opportunity'
          and candidate.class_id is null
          and coalesce(candidate.request_scope, 'class') = 'open_opportunity'
          and (
            lower(coalesce(candidate.opportunity_name, candidate.course_name, '')) = lower(coalesce(cr.opportunity_name, cr.course_name, ''))
            or lower(coalesce(candidate.opportunity_field, candidate.major, '')) = lower(coalesce(cr.opportunity_field, cr.major, ''))
            or lower(coalesce(candidate.opportunity_type, candidate.course_code, '')) = lower(coalesce(cr.opportunity_type, cr.course_code, ''))
            or exists (
              select 1
              from unnest(coalesce(candidate.skills_needed, '{}'::text[])) candidate_skill(skill)
              join unnest(coalesce(cr.skills_needed, '{}'::text[])) current_skill(skill)
                on lower(candidate_skill.skill) = lower(current_skill.skill)
            )
          )
        )
        or (
          cr.class_id is null
          and coalesce(cr.request_scope, 'class') <> 'open_opportunity'
          and candidate.class_id is null
          and coalesce(candidate.request_scope, 'class') <> 'open_opportunity'
          and coalesce(p.university, 'RMIT University') = coalesce(cr.university, 'RMIT University')
          and public.requests_same_course_and_session(cr.id, candidate.id)
        )
      )
  )
  select
    candidate.id,
    candidate.profile_id,
    candidate.class_id,
    candidate.school,
    candidate.major,
    candidate.course,
    candidate.course_name,
    candidate.course_code,
    candidate.class_session,
    candidate.request_scope,
    candidate.opportunity_type,
    candidate.opportunity_field,
    candidate.opportunity_name,
    candidate.deadline,
    candidate.skills_needed,
    candidate.members_needed,
    candidate.total_team_size,
    candidate.teammates_needed_initial,
    candidate.availability,
    candidate.preferred_active_time,
    candidate.work_style,
    candidate.work_styles,
    candidate.requirements,
    candidate.requirements_data,
    candidate.requires_portfolio,
    candidate.portfolio_reference_path,
    candidate.portfolio_reference_name,
    candidate.pinned_until,
    candidate.status,
    candidate.created_at,
    public.public_profile_json(p) as profile,
    public.request_team_status_json_v2(candidate) as team_status
  from candidates candidate
  join public.profiles p on p.id = candidate.profile_id
  order by
    case when candidate.pinned_until > now() then 0 else 1 end,
    candidate.created_at desc;
$$;

grant execute on function public.list_public_profiles() to anon, authenticated;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;
grant execute on function public.list_my_team_requests(uuid) to authenticated;
grant execute on function public.get_team_request_public_v2(uuid) to authenticated;
grant execute on function public.list_active_team_requests_v2() to authenticated;
grant execute on function public.get_match_candidates_for_request_v2(uuid, uuid) to authenticated;
